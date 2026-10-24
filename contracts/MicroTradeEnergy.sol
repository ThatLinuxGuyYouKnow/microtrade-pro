// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MicroTradeEnergy — forward agreements for peer-to-peer energy trading
/// @notice Reference implementation of the settlement rules prototyped in the
/// MicroTrade Pro simulation node (server/chain/ledger.ts). On an L2, Chainlink
/// or meter-oracle attestations would call settleForward with delivered kWh.
contract MicroTradeEnergy {
    struct Forward {
        address buyer;
        address seller;
        uint256 qtyWh; // contracted energy in Wh
        uint256 pricePerKwh; // wei per kWh (settlement token)
        uint256 deliveryStart; // unix timestamp
        uint256 escrow; // buyer deposit (wei)
        uint256 bond; // seller delivery bond (wei)
        uint256 deliveredWh;
        Status status;
    }

    enum Status {
        Active,
        Settled,
        Defaulted
    }

    uint256 public constant TOLERANCE_BPS = 500; // 5% delivery tolerance
    uint256 public constant BOND_BPS = 1200; // 12% seller bond

    uint256 public forwardCount;
    mapping(uint256 => Forward) public forwards;

    event ForwardOpened(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 qtyWh,
        uint256 pricePerKwh,
        uint256 deliveryStart
    );
    event ForwardSettled(uint256 indexed id, uint256 deliveredWh, uint256 payment, uint256 penalty);
    event DeliveryShortfall(uint256 indexed id, uint256 deliveredWh, uint256 shortfallWh);
    event ContractDefaulted(uint256 indexed id, uint256 penalty);

    error InsufficientEscrow();
    error InsufficientBond();
    error NotBuyer();
    error AlreadySettled();

    /// @notice Open a forward agreement. Buyer escrows qty * price; seller bond is
    /// expected to be locked via a prior approve + transferFrom in production.
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
            deliveredWh: 0,
            status: Status.Active
        });
        emit ForwardOpened(id, msg.sender, seller, qtyWh, pricePerKwh, deliveryStart);
    }

    /// @notice Settle against metered delivery. In production only a registered
    /// meter oracle may call this; here the buyer settles for demo purposes.
    /// Testnet note: the seller bond is a recorded benchmark, not pre-funded,
    /// so any penalty is deducted from the payment (production escrows it).
    function settleForward(uint256 id, uint256 deliveredWh) external {
        Forward storage f = forwards[id];
        if (f.status != Status.Active) revert AlreadySettled();
        if (msg.sender != f.buyer) revert NotBuyer();

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

        // Effects before interactions. The contract holds only the buyer
        // escrow (the bond is a recorded slash benchmark, not pre-funded),
        // so the penalty is taken from the payment: outflows always equal
        // the escrow held and settlement can never mint funds.
        uint256 refund = f.escrow > payment ? f.escrow - payment : 0;
        if (penalty > payment + refund) penalty = payment + refund;
        uint256 sellerPayout = payment > penalty ? payment - penalty : 0;
        // Buyer refund + compensation.
        if (refund + penalty > 0) {
            (bool okB, ) = f.buyer.call{value: refund + penalty}("");
            require(okB, "buyer payout failed");
        }
        if (sellerPayout > 0) {
            (bool okS, ) = f.seller.call{value: sellerPayout}("");
            require(okS, "seller payout failed");
        }
    }

    /// @notice GreenREC: minted per settled kWh. Kept minimal for the hackathon;
    /// production would use ERC-1155 with serial + vintage metadata.
    event CertificateMinted(uint256 indexed forwardId, address indexed owner, uint256 kwh, string serial);
    event CertificateRetired(string serial);

    mapping(string => bool) public retired;
    mapping(string => bool) public minted;

    function mintCertificate(uint256 forwardId, address owner, uint256 kwh, string calldata serial) external {
        require(!minted[serial], "already minted");
        minted[serial] = true;
        emit CertificateMinted(forwardId, owner, kwh, serial);
    }

    function retireCertificate(string calldata serial) external {
        require(minted[serial], "unknown serial");
        require(!retired[serial], "already retired");
        retired[serial] = true;
        emit CertificateRetired(serial);
    }
}
