# Alloc

**Your capital. Three choices. One intelligent allocator.**

Live: https://alloc-two.vercel.app · Code: https://github.com/veznidav/alloc
Track: *Agents that act on Robinhood Chain*

---

## The idea

Most people holding crypto face the same question every day and never answer it: *should this capital stay where it is, move to safety, or move into something better?* They don't answer it because answering takes work: reading the market, comparing alternatives, pricing the cost of moving, and then actually doing it across chains.

Alloc is an agent that answers it for one position at a time. You point it at a token you hold on Ethereum or Base. It watches that position and, whenever you ask (or every 15 minutes), it makes one of three calls:

- **Hold.** Nothing is worth the cost and risk of moving. Nothing happens, and you see why.
- **Move to USDC.** The position has weakened. Part of it goes to a stablecoin on the same chain.
- **Move to Robinhood Chain.** A tokenized stock (or, if you allow it, a meme token) looks better after costs. Part of the position moves there.

Every decision comes with a plain explanation, a "why not" for every alternative, the real cost of moving, and either a simulation or a set of transactions ready to sign. Alloc is allowed to do nothing. It is not a trading bot; it is a capital allocator.

## Who it's for

- **Crypto holders who are not traders.** They have positions on Base or Ethereum and no time to manage them. They want a second opinion they can understand, and a button.
- **Robinhood Chain newcomers.** Tokenized stocks and ETFs on-chain are new. Alloc is a guided on-ramp: it finds what is actually tradable, prices the route, and moves the capital in one flow.
- **Risk-seekers, on their own terms.** Four profiles, from Conservative to Degen, set which universe Alloc may consider and how it weighs volatility.

## What you get

- One screen that answers three questions: what do I have, what does Alloc think, what happens if I approve.
- Real data only: live prices, momentum, liquidity, Chainlink reference prices, and live route quotes for the exact amount.
- A transparent model plus SERV Reasoning, so every number in the explanation can be traced.
- Playground (no wallet, nothing traded) and My wallet (real assets, real transactions, your signature on every step).
- Compare the four profiles side by side, a live market board of Robinhood Chain, decision history, and a monitor mode.

## How it works

1. **Read the position.** Token metadata from the chain; price, liquidity, volume and 7/30/90-day momentum from DexScreener, GeckoTerminal and CoinGecko.
2. **Price the alternatives.** USDC on the same chain, plus Robinhood Chain assets allowed by the profile. We scanned all 194 tokens in Robinhood's registry for real on-chain pools (98 are routable) and discover meme tokens live from the most active pools. For each candidate: on-chain price, Chainlink reference, premium, momentum of the underlying stock, and an all-in cost to move the user's amount (Relay quote + Uniswap v3/v4 quoter on Robinhood Chain).
3. **Score.** A simple, explainable model turns this into a net edge per alternative: momentum-based expected return, a volatility term set by the profile, minus the cost of moving, relative to the current asset.
4. **Reason with SERV.** Everything goes to SERV Reasoning with the user's rules and a strict JSON schema. SERV returns the decision, the sizing, confidence, the reasoning steps, a "why not" for every option, and warnings.
5. **Act.** Playground simulates with a live quote. My wallet builds the transactions: Relay for the cross-chain leg (direct into the token when Relay supports it), then Permit2 + UniversalRouter or SwapRouter02 on Robinhood Chain. Alloc checks gas on Robinhood Chain first and tops it up automatically if needed. The user signs each step; autonomous mode is opt-in.

## Why SERV Reasoning

Alloc's hard part is not fetching data. It is turning forty numbers and a set of personal rules into one decision a person will trust with money. That is a reasoning problem, and it is exactly what SERV is built for.

- **Structured reasoning instead of a guess.** Every request runs through SERV's reasoning layer before the model answers. In practice this gave us decisions that cite the supplied numbers, respect the rules (never above the allocation cap, never a route that isn't live), and change sensibly when the profile changes. We saw the same position produce Hold, Move to USDC, Move to META and Move to a meme token across the four profiles, each with a coherent explanation.
- **Consistency at low cost.** SERV lets a small model (`gpt-5.4-mini`) behave like a much larger one. A full decision costs about a cent and takes 10 to 20 seconds, which makes "re-evaluate every 15 minutes" realistic as a product.
- **One endpoint, any model.** SERV is OpenAI-compatible, so the integration is a base URL and a key. We can switch models per profile or per cost budget without touching the app.
- **Prompt guard.** Alloc's system prompt contains the allocation rules. `serv_prompt_guard` is on for every request so user-supplied text (token names, addresses) cannot override them.
- **Structured JSON output.** The decision schema is enforced upstream, so the UI never has to parse prose.

What we would turn on next, as a product:

- **Shadow agents** (`serv_shadow_agent`): a validate-and-iterate loop over the decision. For money decisions this is the right default: a second pass that checks every number in the explanation against the supplied data and that the sizing respects the user's rules, before the user sees it. It is already wired behind an environment flag.
- **Kronos** to audit the generated reasoning prompt, giving an audit trail per decision, which matters the moment real funds move automatically.
- **Multipath** for the branching rules that differ per risk profile, so the four temperaments become first-class branches instead of paragraphs.

## From hackathon to product

Nothing in Alloc exists only for the demo: real positions, real asset data, real routes, real simulations, real transaction previews, and a decision history. The next steps are known: notifications when a watched position's decision changes, more source chains, and autonomous mode with spending limits enforced on-chain. The reasoning layer stays the same; the destinations grow.

## Stack

Next.js 16, TypeScript, Tailwind, wagmi/viem, SERV Reasoning (OpenAI SDK), Relay, Uniswap v3/v4 on Robinhood Chain, Chainlink, DexScreener, GeckoTerminal, CoinGecko, Yahoo Finance. Free infrastructure throughout; hosted on Vercel.

---

# Demo script (about 3 minutes)

Record at 1440×900 or larger, browser only, no tabs bar. Pause half a second after each click so the animation lands. Lines in quotes are the voice-over.

### 0:00 · Open on the landing page

"Most people holding crypto never answer one simple question: should this capital stay where it is, move to safety, or move into something better? Alloc answers it."

Point at the live strip. "It watches the market live, including what is moving on Robinhood Chain right now."

### 0:20 · Playground

Click **Playground**. Click the chip **3,000,000 WELL on Base**. Open **Adjust** so the four profiles are visible for a moment, keep **Balanced**, click **Done**.

"Let's give it a real position: three million WELL on Base. Alloc has four temperaments, from Conservative to Degen. We'll start Balanced."

Click **Ask Alloc**.

"Now watch it work. It reads the position, prices every route with live quotes, and then hands everything to SERV Reasoning."

Let the live feed fill for a few seconds; hover the candidate list. When the decision appears, wait for the spine animation.

### 0:55 · The decision

"Here is the answer. What you have, what Alloc thinks, what it wants to do. It proposes moving twenty percent into a tokenized stock on Robinhood Chain, and shows the amount, the cost, and the expected edge."

Click **View reasoning**. Scroll slowly through the reasoning and the "why not" list.

"Every step is explained in plain language, and every alternative gets a reason for losing. This is SERV's structured reasoning: the decision cites the real numbers instead of guessing."

### 1:30 · Simulate

Scroll up, click **Simulate**.

"Nothing has been traded. The simulation uses a live quote for the exact amount and shows the resulting allocation."

Click **Back**.

### 1:45 · Compare profiles

Click **Compare profiles**. Wait for the four cards.

"Same position, four temperaments, four SERV decisions in parallel. Conservative de-risks into USDC. Aggressive chases a small cap. Degen, which allows meme tokens discovered live on Robinhood Chain, picks a seasoned meme, with the warnings to match."

### 2:10 · My wallet

Click **My wallet**. If the wallet is already connected, the holdings appear; otherwise click **Connect browser wallet**.

"Real mode looks the same, but the position is yours. Alloc reads your balances on both chains, you pick what to watch, and it prepares the transactions."

Pick a holding, click **Ask Alloc**, wait for the decision, click **Review and approve**.

"Before anything moves, you see exactly what will be sold, what you receive, the cost, and even whether you have gas on Robinhood Chain. Alloc tops it up for you if not."

Either sign through the flow (pre-record this part; it takes about a minute) or cut to the finished screen.

"Two signatures on Ethereum, the relayer delivers USDG to Robinhood Chain, two more signatures, and the position is there. Every transaction is listed with a link."

### 2:50 · Close on the Market page

Click **Market**.

"Ninety-eight tokenized stocks and ETFs with real on-chain markets, priced live against their Chainlink reference, plus the memes. This is where Alloc can move capital today."

Back to the landing page.

"Your capital. Three choices. One intelligent allocator. Alloc, built on SERV Reasoning."

---

# Recording and voice-over

- **Screen recording:** Screen Studio (macOS, polished zooms and cursor smoothing) or plain QuickTime / OBS. Hide bookmarks and extensions, use a clean browser profile, 1440×900.
- **Voice-over without your voice:** ElevenLabs is the best quality for a natural narrator; paste each scene's lines, pick one voice, export one clip per scene (the free tier covers a 3-minute script). OpenAI's text-to-speech is a cheaper alternative. Descript can do everything in one place: import the recording, paste the script, generate the AI voice, and align it to the video.
- **Assembly:** Descript, CapCut or iMovie. Lay the voice clips on the timeline, then trim the video to the narration rather than the other way round. Cut waiting time (SERV thinking) to a few seconds with a jump cut; keep the live-feed moment.
- **Music:** low, under the voice, from a royalty-free library (Uppbeat, Pixabay Music).
