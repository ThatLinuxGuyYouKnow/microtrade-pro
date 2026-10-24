"""Build docs/MicroTrade-Pro.pdf — Devpost explainer. Run: python3 make_pdf.py"""
from fpdf import FPDF

INK = (6, 9, 8)
PAPER = (255, 255, 255)
MINT = (52, 211, 153)
DIM = (110, 120, 115)
AMBER = (245, 184, 74)

class Doc(FPDF):
    def header(self):
        pass
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*DIM)
        self.cell(0, 5, f"MicroTrade Pro  ·  IEEE ClimateChain 2026  ·  page {self.page_no()}/{{nb}}", align="C")

def tx(s):
    return (s.replace("\u2014", " -- ").replace("\u2013", "-").replace("\u2022", "-")
             .replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"')
             .replace("\u201d", '"'))

pdf = Doc("P", "mm", "A4")
pdf.alias_nb_pages("{nb}")
pdf.set_auto_page_break(True, margin=15)
pdf.set_margins(15, 12, 15)

def title_block():
    pdf.add_page()
    pdf.image("docs/images/logo.png", x=15, y=12, w=22)
    pdf.set_xy(41, 13)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(*INK)
    pdf.cell(0, 10, "MicroTrade Pro")
    pdf.set_xy(41, 23)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*DIM)
    pdf.cell(0, 6, "Sunlight, traded next door.")
    pdf.set_xy(41, 29)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, "Predictive peer-to-peer energy trading  ·  IEEE ClimateChain 2026, Track 2")
    pdf.ln(12)

def h2(text):
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(20, 120, 85)
    pdf.cell(0, 8, tx(text), new_x="LMARGIN", new_y="NEXT")

def body(text):
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*INK)
    pdf.multi_cell(0, 5.2, tx(text))
    pdf.ln(1.5)

def bullets(items):
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*INK)
    for b, t in items:
        pdf.set_font("Helvetica", "B", 10)
        pdf.write(5.2, tx(f"\u2022  {b} "))
        pdf.set_font("Helvetica", "", 10)
        pdf.write(5.2, tx(t) + "\n")
    pdf.ln(1.5)

def img(path, w, caption=None):
    pdf.image(path, x=(210 - w) / 2, w=w)
    if caption:
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(*DIM)
        pdf.cell(0, 5, caption, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

title_block()

h2("The problem")
body("Most rooftop solar is wasted \u2014 exported for pennies while the evening peak is "
     "bought back at full price. The grid takes its cut both ways, and the carbon savings "
     "are never counted.")

h2("What it does")
bullets([
    ("Predict. ", "Each of 9 household agents trains its own ridge-ensemble forecaster on "
     "three weeks of meter history plus live weather: 48-hour load and solar curves with "
     "P10\u2013P90 bands, ~10% error, 62% better than guessing."),
    ("Trade. ", "Every morning the agents bid into a uniform-price double auction \u2014 one "
     "clearing price per hour. Matches become forward contracts: buyer escrows payment, "
     "seller stakes a 12% bond."),
    ("Settle. ", "Hourly delivery is metered; escrow releases, shortfalls slash bonds, and each "
     "delivered green kWh mints a GreenREC. Every write is a signed, Merkle-committed "
     "ledger transaction \u2014 mirrored on-chain."),
])
img("docs/images/microgrid.png", 170, "Live 3D microgrid: nine homes around a community battery")

h2("Smart contracts \u2014 deployed, not vaporware")
pdf.set_font("Helvetica", "", 10)
pdf.set_text_color(*INK)
pdf.multi_cell(0, 5.2, tx("V2 is the hardened build: reentrancy guard, staked seller bonds, "
    "oracle-gated settlement and minting, zeroed balances before external calls. Sources in contracts/ (MIT)."))
pdf.ln(1)
pdf.set_fill_color(240, 247, 243)
pdf.set_font("Courier", "", 8.2)
contracts = [
    ("Base Sepolia (84532, headline): ", "0x45C0Be734cF808fcab42E285F33a7a811cc8EB00"),
    ("Ethereum Sepolia V2 mirror:      ", "0x2f7EbFA1942B97F74D428226CcA48dD643794E78"),
    ("Ethereum Sepolia V1:             ", "0x8d1e4ad61a2e4071707b512473652924b8E4c914"),
]
x0 = pdf.get_x()
for label, addr in contracts:
    pdf.set_font("Helvetica", "", 8.5)
    pdf.write(5, label)
    pdf.set_font("Courier", "", 8.2)
    pdf.write(5, addr + "\n")
pdf.ln(1)
pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(*DIM)
pdf.multi_cell(0, 5, tx("Honest scope: testnet deployments, self-reviewed and hardened \u2014 "
    "not a third-party audit. The code is open and every claim is checkable on-chain."))
pdf.set_text_color(*INK)
pdf.ln(2)

img("docs/images/forecast.png", 150, "48-hour forecast with uncertainty bands")
img("docs/images/market.png", 150, "Day-ahead double auction and forward book")
img("docs/images/ledger.png", 150, "Verifiable settlement ledger with RECs")

h2("How it was built")
body("React + Three.js live microgrid, Node/Express deterministic simulation engine, "
     "dependency-free ridge regression, Ed25519-signed ledger, Solidity V2 on Base Sepolia. "
     "Demo film cut with Hyperframes from real app capture, voiced with Deepgram.")

h2("What\u2019s next")
body("Mainnet pilot with a real community battery, oracle feeds for settlement, "
     "third-party audit of V2, and smart-plug metering integrations.")

h2("Links")
pdf.set_font("Helvetica", "", 10)
for label, url in [
    ("Live demo:  ", "https://microtrade-pro.onrender.com/"),
    ("Code (MIT):  ", "https://github.com/ThatLinuxGuyYouKnow/microtrade-pro"),
    ("Demo video:  ", "YouTube link in the Devpost entry"),
]:
    pdf.write(5.5, label)
    pdf.set_text_color(20, 100, 200)
    pdf.write(5.5, url + "\n")
    pdf.set_text_color(*INK)

pdf.output("docs/MicroTrade-Pro.pdf")
print("wrote docs/MicroTrade-Pro.pdf")
