// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MicroTradeEnergyV2 — hardened forward agreements for P2P energy trading
/// @notice V2 addresses the three V1 audit notes:
/// 1. The seller bond is actually escrowed via depositBond (V1 only recorded it,
///    so the "penalty" came out of the buyer's own escrow).
/// 2. Settlement and minting are oracle-gated (V1 let the buyer self-report
///    delivery and let anyone mint certificates).
/// 3. Payouts are mutex-guarded with balances zeroed before external calls.
/// Single file, no imports, so Remix and explorer verification stay one-click.
/// @dev Compile with the optimizer enabled (200 runs) to keep L2 costs down.
contract MicroTradeEnergyV2 {
    struct Forward {
        address buyer;
        address seller;
        uint256 qtyWh; // contracted energy in Wh
        uint256 pricePerKwh; // wei per kWh (settlement token)
        uint256 deliveryStart; // unix timestamp
        uint256 escrow; // buyer deposit (wei)
        uint256 bond; // seller delivery bond (wei)
        bool bondDeposited;
        uint256 deliveredWh;
        Status status;
    }

    enum Status {
        Active,
        Settled,
        Defaulted,
        Cancelled
    }

    uint256 public constant TOLERANCE_BPS = 500; // 5% delivery tolerance
    uint256 public constant BOND_BPS = 1200; // 12% seller bond

    address public owner;
    mapping(address => bool) public isOracle;

    uint256 public forwardCount;
    mapping(uint256 => Forward) public forwards;

    mapping(string => bool) public minted;
    mapping(string => bool) public retired;
    mapping(string => address) public certOwner;

    bool private locked;

    event ForwardOpened(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 qtyWh,
        uint256 pricePerKwh,
        uint256 deliveryStart
    );
    event BondDeposited(uint256 indexed id, uint256 amount);
    event ForwardSettled(uint256 indexed id, uint256 deliveredWh, uint256 payment, uint256 penalty);
    event DeliveryShortfall(uint256 indexed id, uint256 deliveredWh, uint256 shortfallWh);
    event ContractDefaulted(uint256 indexed id, uint256 penalty);
    event ForwardCancelled(uint256 indexed id);
    event OracleUpdated(address indexed oracle, bool authorized);
    event CertificateMinted(uint256 indexed forwardId, address indexed certOwner, uint256 kwh, string serial);
    event CertificateRetired(string serial);

    error InsufficientEscrow();
    error InsufficientBond();
    error NotBuyer();
    error NotSeller();
    error NotOracle();
    error BondMissing();
    error AlreadySettled();

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "reentrant");
        locked = true;
        _;
        locked = false;
    }

    constructor() {
        owner = msg.sender;
        isOracle[msg.sender] = true; // deployer is the first oracle; rotate in production
        emit OracleUpdated(msg.sender, true);
    }

    function authorizeOracle(address oracle, bool authorized) external onlyOwner {
        isOracle[oracle] = authorized;
        emit OracleUpdated(oracle, authorized);
    }

    /// @notice Open a forward agreement. Buyer escrows qty * price; excess ETH
    /// sent by accident is refunded immediately.
    function openForward(
        address seller,
        uint256 qtyWh,
        uint256 pricePerKwh,
        uint256 deliveryStart
    ) external payable returns (uint256 id) {
        uint256 escrow = (qtyWh * pricePerKwh) / 1e3; // qty in Wh -> kWh
        if (msg.value < escrow) revert InsufficientEscrow();
        id = ++forwardCount;
        uint256 bond = (escrow * BOND_BPS) / 10_000;
        forwards[id] = Forward({
            buyer: msg.sender,
            seller: seller,
            qtyWh: qtyWh,
            pricePerKwh: pricePerKwh,
            deliveryStart: deliveryStart,
            escrow: escrow,
            bond: bond,
            bondDeposited: false,
            deliveredWh: 0,
            status: Status.Active
        });
        emit ForwardOpened(id, msg.sender, seller, qtyWh, pricePerKwh, deliveryStart);
        if (msg.value > escrow) {
            (bool ok, ) = msg.sender.call{value: msg.value - escrow}("");
            require(ok, "excess refund failed");
        }
    }

    /// @notice Seller stakes the delivery bond. Settlement is blocked until funded.
    function depositBond(uint256 id) external payable {
        Forward storage f = forwards[id];
        if (f.status != Status.Active) revert AlreadySettled();
        if (msg.sender != f.seller) revert NotSeller();
        require(!f.bondDeposited, "bond funded");
        if (msg.value != f.bond) revert InsufficientBond();
        f.bondDeposited = true;
        emit BondDeposited(id, msg.value);
    }

    /// @notice Buyer reclaim path if the seller never stakes the bond.
    function cancelUnfunded(uint256 id) external nonReentrant {
        Forward storage f = forwards[id];
        if (f.status != Status.Active) revert AlreadySettled();
        if (msg.sender != f.buyer) revert NotBuyer();
        require(!f.bondDeposited, "bond funded");
        f.status = Status.Cancelled;
        uint256 refund = f.escrow;
        f.escrow = 0;
        emit ForwardCancelled(id);
        (bool ok, ) = f.buyer.call{value: refund}("");
        require(ok, "refund failed");
    }

    /// @notice Oracle-attested settlement. The penalty is slashed from the
    /// seller's staked bond, never from the buyer's escrow.
    function settleForward(uint256 id, uint256 deliveredWh) external nonReentrant {
        Forward storage f = forwards[id];
        if (f.status != Status.Active) revert AlreadySettled();
        if (!isOracle[msg.sender]) revert NotOracle();
        if (!f.bondDeposited) revert BondMissing();

        uint256 tolerance = (f.qtyWh * TOLERANCE_BPS) / 10_000;
        uint256 payment = (deliveredWh * f.pricePerKwh) / 1e3;
        if (payment > f.escrow) payment = f.escrow;

        f.deliveredWh = deliveredWh;
        uint256 penalty = 0;

        if (deliveredWh + tolerance < f.qtyWh) {
            uint256 shortfall = f.qtyWh - deliveredWh;
            emit DeliveryShortfall(id, deliveredWh, shortfall);
            // 60% of bond slashed on material default, 25% on minor shortfall.
            uint256 slashBps = deliveredWh * 10_000 < f.qtyWh * 8000 ? 6000 : 2500;
            penalty = (f.bond * slashBps) / 10_000;
            if (deliveredWh * 10_000 < f.qtyWh * 8000) {
                f.status = Status.Defaulted;
                emit ContractDefaulted(id, penalty);
            } else {
                f.status = Status.Settled;
            }
        } else {
            f.status = Status.Settled;
        }

        emit ForwardSettled(id, deliveredWh, payment, penalty);

        // Effects before interactions: zero balances before any external call.
        // Contract holds escrow + bond; outflows are refund + payment + bond.
        uint256 escrow = f.escrow;
        uint256 bond = f.bond;
        f.escrow = 0;
        f.bond = 0;

        uint256 refund = escrow > payment ? escrow - payment : 0;
        uint256 buyerPayout = refund + penalty;
        uint256 sellerPayout = payment + (bond - penalty);

        if (buyerPayout > 0) {
            (bool okB, ) = f.buyer.call{value: buyerPayout}("");
            require(okB, "buyer payout failed");
        }
        if (sellerPayout > 0) {
            (bool okS, ) = f.seller.call{value: sellerPayout}("");
            require(okS, "seller payout failed");
        }
    }

    /// @notice GreenREC: only an oracle may mint, only against a settled
    /// forward, and never for more than was delivered.
    function mintCertificate(
        uint256 forwardId,
        address owner_,
        uint256 kwh,
        string calldata serial
    ) external {
        if (!isOracle[msg.sender]) revert NotOracle();
        require(!minted[serial], "already minted");
        Forward storage f = forwards[forwardId];
        require(f.status == Status.Settled || f.status == Status.Defaulted, "forward open");
        require(kwh * 1e3 <= f.deliveredWh, "kwh exceeds delivery");
        minted[serial] = true;
        certOwner[serial] = owner_;
        emit CertificateMinted(forwardId, owner_, kwh, serial);
    }

    function retireCertificate(string calldata serial) external {
        require(minted[serial], "unknown serial");
        require(!retired[serial], "already retired");
        require(msg.sender == certOwner[serial], "not cert owner");
        retired[serial] = true;
        emit CertificateRetired(serial);
    }
}
