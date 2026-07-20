"""
🌙 Moon Dev's AI Trading Agent
Built with love by Moon Dev 🚀
"""

# ⏰ Run Configuration
RUN_INTERVAL_MINUTES = 15  # How often the AI agent runs

# 🎯 Trading Strategy Prompt - The Secret Sauce! 
TRADING_PROMPT = """
You are Moon Dev's AI Trading Assistant 🌙

Analyze the provided market data and make a trading decision based on these criteria:
1. Price action relative to MA20 and MA40
2. RSI levels and trend
3. Volume patterns
4. Recent price movements

Respond in this exact format:
1. First line must be one of: BUY, SELL, or NOTHING (in caps)
2. Then explain your reasoning, including:
   - Technical analysis
   - Risk factors
   - Market conditions
   - Confidence level (as a percentage, e.g. 75%)

Remember: Moon Dev always prioritizes risk management! 🛡️
"""

# 💰 Portfolio Allocation Prompt
ALLOCATION_PROMPT = """
You are Moon Dev's Portfolio Allocation Assistant 🌙

Given the total portfolio size and trading recommendations, allocate capital efficiently.
Consider:
1. Position sizing based on confidence levels
2. Risk distribution
3. Keep cash buffer as specified
4. Maximum allocation per position

Format your response as a Python dictionary:
{
    "token_address": allocated_amount,  # In USD
    ...
    "USDC_ADDRESS": remaining_cash  # Always use USDC_ADDRESS for cash
}

Remember:
- Total allocations must not exceed total_size
- Higher confidence should get larger allocations
- Never allocate more than {MAX_POSITION_PERCENTAGE}% to a single position
- Keep at least {CASH_PERCENTAGE}% in USDC as safety buffer
- Only allocate to BUY recommendations
- Cash must be stored as USDC using USDC_ADDRESS: {USDC_ADDRESS}
"""

import anthropic
import os
import json
import pandas as pd
from termcolor import colored, cprint
from dotenv import load_dotenv
from ..core import config
from ..core.config import *
from ..core import nice_funcs as n  # Import nice_funcs as n
from ..core.broker import get_broker
from ..core.tracker import DecisionTracker
from ..agents.risk import check_trade, limits_from_config, RiskInputs
from ..agents import sentiment as sentiment_agent
from ..data.ohlcv_collector import collect_all_tokens
from datetime import datetime, timedelta
import time

# Load environment variables
load_dotenv()


def _price(token):
    """Live price lookup, used by both the paper broker (for marks) and the
    tracker (for grading). The only place the agent reads a raw chain price."""
    return n.token_price(token)


def day_start_equity(broker, path="bot_data/day_equity.json"):
    """Persisted opening equity for the day (for the daily-loss circuit
    breaker). Refreshes when the calendar date rolls over."""
    today = datetime.now().strftime("%Y-%m-%d")
    stored = None
    if os.path.exists(path):
        try:
            with open(path) as f:
                stored = json.load(f)
        except Exception:
            stored = None
    if not stored or stored.get("date") != today:
        eq = broker.equity()
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            json.dump({"date": today, "equity": eq}, f)
        return eq
    return stored["equity"]


class TradingAgent:
    def __init__(self):
        """Initialize the AI Trading Agent with Moon Dev's magic ✨"""
        api_key = os.getenv("ANTHROPIC_KEY")
        if not api_key:
            raise ValueError("🚨 ANTHROPIC_KEY not found in environment variables!")

        self.client = anthropic.Anthropic(api_key=api_key)
        self.recommendations_df = pd.DataFrame(columns=['token', 'action', 'confidence', 'reasoning'])
        # The broker is the SINGLE paper/live decision point — the agent never
        # calls nice_funcs execution directly.
        self.broker = get_broker(price_fn=_price)
        self.risk_limits = limits_from_config(config)
        self.tracker = DecisionTracker(
            horizon_minutes=RUN_INTERVAL_MINUTES * 4,  # grade a call ~4 cycles later
        )
        # Cooldown bookkeeping: token -> datetime of last close this session.
        self.last_close_at = {}
        cprint(f"🤖 Moon Dev's AI Trading Agent initialized in {self.broker.mode.upper()} mode!", "white", "on_blue")
        
    def _sentiment_for(self, market_df):
        """Keyless price-action sentiment proxy from the OHLCV frame."""
        try:
            closes = market_df["Close"].tolist() if hasattr(market_df, "columns") else []
            volumes = market_df["Volume"].tolist() if hasattr(market_df, "columns") else None
            return sentiment_agent.combined_sentiment(None, closes, volumes)
        except Exception:
            return sentiment_agent.Sentiment(0.0, "neutral", "price-action-proxy", "unavailable")

    def analyze_market_data(self, token, market_df):
        """Analyze market data using Claude, blended with a sentiment proxy."""
        try:
            sent = self._sentiment_for(market_df)
            market_data = market_df.to_dict() if hasattr(market_df, "to_dict") else market_df
            sentiment_note = (
                f"\n\nSentiment proxy (price-action, NOT real social data): "
                f"{sent.label} (score {sent.score:+.2f}, {sent.detail})."
            )

            message = self.client.messages.create(
                model=AI_MODEL,
                max_tokens=AI_MAX_TOKENS,
                temperature=AI_TEMPERATURE,
                messages=[
                    {
                        "role": "user",
                        "content": f"{TRADING_PROMPT}\n\nMarket Data to Analyze:\n{market_data}{sentiment_note}"
                    }
                ]
            )

            # Parse the response - handle both string and list responses
            response = message.content
            if isinstance(response, list):
                # Extract text from TextBlock objects if present
                response = '\n'.join([
                    item.text if hasattr(item, 'text') else str(item)
                    for item in response
                ])

            lines = response.split('\n')
            action = lines[0].strip() if lines else "NOTHING"

            # Extract confidence from the response (assuming it's mentioned as a percentage)
            confidence = 0
            for line in lines:
                if 'confidence' in line.lower():
                    # Extract number from string like "Confidence: 75%"
                    try:
                        confidence = int(''.join(filter(str.isdigit, line)))
                    except:
                        confidence = 50  # Default if not found

            # Add to recommendations DataFrame with proper reasoning
            reasoning = '\n'.join(lines[1:]) if len(lines) > 1 else "No detailed reasoning provided"
            self.recommendations_df = pd.concat([
                self.recommendations_df,
                pd.DataFrame([{
                    'token': token,
                    'action': action,
                    'confidence': confidence,
                    'reasoning': reasoning
                }])
            ], ignore_index=True)

            # Measurement: log this call with the price NOW so a later run can
            # grade whether the AI was right. This is what proves (or disproves)
            # skill over time — read it with tracker.report().
            try:
                self.tracker.log_decision(token, action, confidence, _price(token))
            except Exception as e:
                cprint(f"⚠️ could not log decision for {token[:4]}: {e}", "white", "on_yellow")

            print(f"🎯 Moon Dev's AI Analysis Complete for {token[:4]}! (sentiment: {sent.label})")
            return response
            
        except Exception as e:
            print(f"❌ Error in AI analysis: {str(e)}")
            # Still add to DataFrame even on error, but mark as NOTHING with 0 confidence
            self.recommendations_df = pd.concat([
                self.recommendations_df,
                pd.DataFrame([{
                    'token': token,
                    'action': "NOTHING",
                    'confidence': 0,
                    'reasoning': f"Error during analysis: {str(e)}"
                }])
            ], ignore_index=True)
            return None
    
    def allocate_portfolio(self, total_size):
        """Allocate portfolio based on recommendations"""
        try:
            # Clean and format recommendations for the allocation agent
            clean_df = self.recommendations_df.copy()
            
            # Filter to only include BUY recommendations
            buy_df = clean_df[clean_df['action'] == 'BUY'].copy()
            if buy_df.empty:
                cprint("🤔 No BUY recommendations - keeping everything in USDC", "white", "on_blue")
                return {USDC_ADDRESS: total_size}
            
            # Ensure all columns are strings and clean any TextBlock objects
            for col in buy_df.columns:
                buy_df[col] = buy_df[col].apply(lambda x: 
                    x.text if hasattr(x, 'text') else str(x))
            
            # Calculate maximum position size (30% of total)
            max_position_size = total_size * 0.30
            cprint(f"🎯 Maximum position size: ${max_position_size:.2f} (30% of ${total_size:.2f})", "white", "on_blue")
            
            recommendations_str = buy_df.to_string()
            
            message = self.client.messages.create(
                model=AI_MODEL,
                max_tokens=AI_MAX_TOKENS,
                temperature=AI_TEMPERATURE,
                messages=[
                    {
                        "role": "user", 
                        "content": f"{ALLOCATION_PROMPT}\n\nTotal Size: ${total_size}\nMax Position Size: ${max_position_size}\n\nRecommendations:\n{recommendations_str}"
                    }
                ]
            )
            
            # Parse the allocation response
            allocation_str = message.content
            if isinstance(allocation_str, list):
                allocation_str = '\n'.join([
                    item.text if hasattr(item, 'text') else str(item)
                    for item in allocation_str
                ])
            
            # Extract the dictionary string and parse it
            try:
                start_idx = allocation_str.find('{')
                end_idx = allocation_str.find('}', start_idx) + 1
                if start_idx != -1 and end_idx != -1:
                    json_str = allocation_str[start_idx:end_idx]
                    json_str = json_str.strip()
                    allocation_dict = json.loads(json_str)
                    
                    # Ensure cash is stored with USDC_ADDRESS
                    if 'cash' in allocation_dict:
                        allocation_dict[USDC_ADDRESS] = allocation_dict.pop('cash')
                    if 'USDC_ADDRESS' in allocation_dict:
                        allocation_dict[USDC_ADDRESS] = allocation_dict.pop('USDC_ADDRESS')
                        
                    # Validate and cap allocations
                    for token, amount in list(allocation_dict.items()):
                        if token != USDC_ADDRESS and amount > max_position_size:
                            cprint(f"⚠️ Capping {token} allocation from ${amount:.2f} to ${max_position_size:.2f}", "white", "on_yellow")
                            allocation_dict[token] = max_position_size
                else:
                    raise ValueError("Could not find valid JSON in response")
                
                # Create DataFrame with allocations
                allocations_df = pd.DataFrame([
                    {"token": k, "allocation": v, "timestamp": datetime.now()}
                    for k, v in allocation_dict.items()
                ])
                
                # Save to CSV in src/data directory
                os.makedirs('src/data', exist_ok=True)
                allocations_df.to_csv('src/data/current_allocation.csv', index=False)
                cprint("💾 Portfolio allocation saved with position size limits!", "white", "on_blue")
                
                return allocation_dict
                
            except Exception as e:
                print(f"❌ Error parsing allocation response: {str(e)}")
                print(f"Raw response: {allocation_str}")
                return None
            
        except Exception as e:
            print(f"❌ Error in portfolio allocation: {str(e)}")
            return None

    def execute_allocations(self, allocation_dict):
        """Execute the allocations — every buy passes the RISK GATE first and
        goes through the broker (paper or live). The agent never touches the
        chain directly."""
        try:
            cprint(f"\n🚀 Executing allocations in {self.broker.mode.upper()} mode...", "white", "on_blue")

            day_start = day_start_equity(self.broker)
            equity = self.broker.equity()
            open_positions = self.broker.open_positions()
            open_count = len(open_positions) if open_positions else 0

            for token, amount in allocation_dict.items():
                if token == USDC_ADDRESS:
                    print(f"💵 Keeping ${amount:.2f} in USDC as buffer")
                    continue

                cprint(f"\n🎯 Considering {token[:8]} (target ${amount:.2f})...", "white", "on_blue")
                try:
                    current_position = self.broker.position_usd(token)

                    # Only enter if we're meaningfully below target (97% threshold).
                    if current_position >= amount * 0.97:
                        print(f"⏸️ Position already near target (${current_position:.2f}) — skipping")
                        continue

                    last_close = self.last_close_at.get(token)
                    mins_since_close = (
                        (datetime.now() - last_close).total_seconds() / 60.0 if last_close else None
                    )

                    decision = check_trade(
                        RiskInputs(
                            token=token,
                            confidence=self._confidence_for(token),
                            proposed_usd=amount - current_position,
                            equity_usd=equity,
                            cash_usd=self.broker.cash(),
                            current_position_usd=current_position,
                            open_position_count=open_count,
                            day_start_equity=day_start,
                            minutes_since_last_close=mins_since_close,
                        ),
                        self.risk_limits,
                    )

                    if not decision.allow:
                        cprint(f"🛡️ Risk gate blocked {token[:8]}: {decision.reason}", "white", "on_yellow")
                        continue

                    cprint(f"✅ Risk gate: {decision.reason}", "white", "on_green")
                    ok, reason = self.broker.buy(token, decision.approved_usd)
                    if ok and current_position <= 0:
                        open_count += 1  # a new position was opened this run

                except Exception as e:
                    print(f"❌ Error executing entry for {token[:8]}: {str(e)}")

                time.sleep(2)

        except Exception as e:
            print(f"❌ Error executing allocations: {str(e)}")
            print("🔧 Moon Dev suggests checking the logs and trying again!")

    def _confidence_for(self, token):
        """The AI confidence recorded for a token this run (0 if none)."""
        rows = self.recommendations_df[self.recommendations_df['token'] == token]
        if rows.empty:
            return 0
        try:
            return float(rows.iloc[-1]['confidence'])
        except Exception:
            return 0

    def handle_exits(self):
        """Close positions the AI wants out of — through the broker."""
        cprint("\n🔄 Checking for positions to exit...", "white", "on_blue")

        for _, row in self.recommendations_df.iterrows():
            token = row['token']
            action = row['action']

            current_position = self.broker.position_usd(token)

            if current_position > 0 and action in ["SELL", "NOTHING"]:
                cprint(f"\n🚫 AI recommends {action} for {token[:8]} (position ${current_position:.2f})", "white", "on_yellow")
                try:
                    ok, realized = self.broker.close(token)
                    if ok:
                        self.last_close_at[token] = datetime.now()
                        cprint(f"✅ Closed {token[:8]}", "white", "on_green")
                except Exception as e:
                    cprint(f"❌ Error closing {token[:8]}: {str(e)}", "white", "on_red")
            elif current_position > 0:
                cprint(f"✨ Keeping {token[:8]} (${current_position:.2f}) — AI says {action}", "white", "on_blue")

def _print_accuracy(agent):
    """Show the measured track record — the whole point of paper mode."""
    report = agent.tracker.report()
    if not report["graded"]:
        cprint("\n📏 No graded decisions yet — accuracy appears once calls mature.", "white", "on_blue")
        return
    cprint("\n📏 MEASURED ACCURACY (is the AI actually right?)", "white", "on_blue")
    print(f"   Graded calls: {report['graded']}  |  Overall win rate: {report['win_rate']*100:.0f}%")
    print(f"   Avg move per call: {report['avg_return_pct']:+.1f}%")
    for act, s in report["by_action"].items():
        print(f"   {act:8} {s['win_rate']*100:.0f}% right (n={s['n']})")
    for b, s in report["by_confidence"].items():
        print(f"   confidence {b:4} {s['win_rate']*100:.0f}% right (n={s['n']})")


def main():
    """Main function to run the trading agent every 15 minutes"""
    cprint("🌙 Moon Dev AI Trading System Starting Up! 🚀", "white", "on_blue")
    mode = "PAPER (fake money)" if config.PAPER_TRADING else "LIVE ⚠️ REAL MONEY"
    cprint(f"🛡️  Trading mode: {mode}", "white", "on_green" if config.PAPER_TRADING else "on_red")
    if not config.PAPER_TRADING:
        cprint("   (Live still requires ALLOW_LIVE_TRADING=true in your env, or it stays paper.)", "white", "on_yellow")

    INTERVAL = RUN_INTERVAL_MINUTES * 60  # Convert minutes to seconds

    while True:
        try:
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cprint(f"\n⏰ AI Agent Run Starting at {current_time}", "white", "on_green")

            # Collect OHLCV data for all tokens
            cprint("📊 Collecting market data...", "white", "on_blue")
            market_data = collect_all_tokens()

            # Initialize AI agent
            agent = TradingAgent()

            # Grade any decisions that have now matured (measurement first).
            try:
                graded = agent.tracker.grade_matured(_price)
                if graded:
                    cprint(f"📏 Graded {graded} matured decision(s).", "white", "on_blue")
            except Exception as e:
                cprint(f"⚠️ grading step failed: {e}", "white", "on_yellow")

            # Analyze each token's data
            for token, data in market_data.items():
                cprint(f"\n🤖 AI Agent Analyzing Token: {token}", "white", "on_green")
                analysis = agent.analyze_market_data(token, data)  # pass the DataFrame
                print(f"\n📈 Analysis for contract: {token}")
                print(analysis)
                print("\n" + "="*50 + "\n")

            # Show recommendations summary (without reasoning)
            cprint("\n📊 Moon Dev's Trading Recommendations:", "white", "on_blue")
            summary_df = agent.recommendations_df[['token', 'action', 'confidence']].copy()
            print(summary_df.to_string(index=False))

            # Handle exits first — through the broker (paper or live).
            agent.handle_exits()

            # Then proceed with new allocations for BUY recommendations.
            cprint("\n💰 Calculating optimal portfolio allocation...", "white", "on_blue")
            allocation = agent.allocate_portfolio(usd_size)

            if allocation:
                cprint("\n💼 Moon Dev's Portfolio Allocation:", "white", "on_blue")
                print(json.dumps(allocation, indent=4))
                agent.execute_allocations(allocation)
                cprint("\n✨ Allocation pass complete!", "white", "on_blue")
            else:
                cprint("\n⚠️ No allocations to execute!", "white", "on_yellow")

            # Show the measured track record.
            _print_accuracy(agent)
            
            next_run = datetime.now() + timedelta(minutes=RUN_INTERVAL_MINUTES)
            cprint(f"\n⏳ AI Agent run complete. Next run at {next_run.strftime('%Y-%m-%d %H:%M:%S')}", "white", "on_green")
            
            # Clean up temp data before sleeping
            cprint("\n🧹 Cleaning up temporary data...", "white", "on_blue")
            try:
                for file in os.listdir('temp_data'):
                    if file.endswith('_latest.csv'):
                        os.remove(os.path.join('temp_data', file))
                cprint("✨ Temp data cleaned successfully!", "white", "on_green")
            except Exception as e:
                cprint(f"⚠️ Error cleaning temp data: {str(e)}", "white", "on_yellow")
            
            # Sleep until next interval
            time.sleep(INTERVAL)
                
        except KeyboardInterrupt:
            cprint("\n👋 Moon Dev AI Agent shutting down gracefully...", "white", "on_blue")
            break
        except Exception as e:
            cprint(f"\n❌ Error: {str(e)}", "white", "on_red")
            cprint("🔧 Moon Dev suggests checking the logs and trying again!", "white", "on_blue")
            # Still sleep and continue on error
            time.sleep(INTERVAL)

if __name__ == "__main__":
    main() 