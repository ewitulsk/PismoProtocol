import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Set, Optional, Any, Callable, Awaitable, Union, Coroutine
from collections import defaultdict

from src.models.price_feed_models import OHLCBar, TimeInterval, PythPriceData

# Type for callbacks that might be sync or async
CallbackType = Callable[[OHLCBar, str, Set[str]], Union[None, Awaitable[None]]]


class OHLCService:
    """
    Service that constructs OHLC bars from Pyth price feed updates.
    """

    def __init__(self):
        self.logger = logging.getLogger("ohlc_service")
        self.bars: Dict[str, Dict[TimeInterval, List[OHLCBar]]] = defaultdict(lambda: defaultdict(list))
        self.last_prices: Dict[str, float] = {}  # feed_id -> price
        self.feed_symbols: Dict[str, str] = {}  # feed_id -> symbol
        self.subscribers: Dict[str, Dict[str, Set[TimeInterval]]] = defaultdict(lambda: defaultdict(set))
        self.callbacks: List[CallbackType] = []
        self._running = False
        self._task = None
        
        # Track which intervals have been updated and need notification
        self.updated_intervals: Dict[str, Dict[TimeInterval, str]] = defaultdict(dict)
        # Track when a new bar is created for an interval
        self.new_bar_intervals: Dict[str, Set[TimeInterval]] = defaultdict(set)
        
        # Populate interval durations
        self.interval_durations = {
            TimeInterval.ONE_MINUTE: timedelta(minutes=1),
            TimeInterval.FIVE_MINUTES: timedelta(minutes=5),
            TimeInterval.FIFTEEN_MINUTES: timedelta(minutes=15),
            TimeInterval.THIRTY_MINUTES: timedelta(minutes=30),
            TimeInterval.ONE_HOUR: timedelta(hours=1),
            TimeInterval.FOUR_HOURS: timedelta(hours=4),
            TimeInterval.ONE_DAY: timedelta(days=1),
        }
        
    async def start(self):
        """Start the OHLC service."""
        if self._running:
            return
            
        self._running = True
        self._task = asyncio.create_task(self._check_bar_expiry())
        self.logger.info("OHLC service started")
        
    async def stop(self):
        """Stop the OHLC service."""
        if not self._running:
            return
            
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        
        self.logger.info("OHLC service stopped")
    
    def register_callback(self, callback: CallbackType):
        """
        Register a callback function to be called when bars are updated or new bars are created.
        
        Args:
            callback: Callable function (sync or async) that will receive the updated bar, event type, and subscribers
        """
        self.callbacks.append(callback)
    
    async def subscribe(self, client_id: str, feed_id: str, intervals: List[TimeInterval]):
        """
        Subscribe a client to OHLC bars for a specific feed and intervals.
        
        Args:
            client_id: Unique client ID
            feed_id: Pyth feed ID
            intervals: List of time intervals to subscribe to
        """
        for interval in intervals:
            self.subscribers[feed_id][client_id].add(interval)
            
        self.logger.info(f"Client {client_id} subscribed to {feed_id} bars with intervals: {intervals}")
        
        # Send current bars to the client for each subscribed interval
        for interval in intervals:
            current_bars = self.get_latest_bars(feed_id, interval, 50)
            for bar in current_bars:
                # Use the historical data notification method for initial data
                await self._notify_bar(bar, "new_bar", {client_id})

    async def unsubscribe(self, client_id: str, feed_id: str = None, intervals: List[TimeInterval] = None):
        """
        Unsubscribe a client from OHLC bars.
        
        Args:
            client_id: Unique client ID
            feed_id: Optional feed ID to unsubscribe from (if None, unsubscribe from all feeds)
            intervals: Optional list of intervals to unsubscribe from (if None, unsubscribe from all intervals)
        """
        if feed_id is None:
            # Unsubscribe from all feeds
            for feed in list(self.subscribers.keys()):
                if client_id in self.subscribers[feed]:
                    del self.subscribers[feed][client_id]
                if not self.subscribers[feed]:
                    del self.subscribers[feed]
        else:
            # Unsubscribe from specific feed
            if feed_id in self.subscribers and client_id in self.subscribers[feed_id]:
                if intervals is None:
                    # Unsubscribe from all intervals for this feed
                    del self.subscribers[feed_id][client_id]
                else:
                    # Unsubscribe from specific intervals
                    for interval in intervals:
                        self.subscribers[feed_id][client_id].discard(interval)
                
                # Clean up empty structures
                if not self.subscribers[feed_id][client_id]:
                    del self.subscribers[feed_id][client_id]
                if not self.subscribers[feed_id]:
                    del self.subscribers[feed_id]
                    
        self.logger.info(f"Client {client_id} unsubscribed from feed: {feed_id or 'all'}, intervals: {intervals or 'all'}")
    
    async def update_price(self, price_data: PythPriceData, symbol: str = None):
        """
        Update the OHLC bars with a new price update.
        
        Args:
            price_data: New price data from Pyth
            symbol: Optional symbol name for the feed
        """
        feed_id = price_data.id
        
        # Convert price to actual value with exponent
        price = price_data.price * (10 ** price_data.expo)
        
        # Store the symbol for this feed if provided
        if symbol:
            self.feed_symbols[feed_id] = symbol
        elif feed_id not in self.feed_symbols:
            # Use feed_id as symbol if none provided
            self.feed_symbols[feed_id] = feed_id
        
        # Store the last price
        self.last_prices[feed_id] = price
        
        # Get the current time
        current_time = price_data.publish_time
        
        # Reset the tracking for this update
        self.updated_intervals[feed_id].clear()
        self.new_bar_intervals[feed_id].clear()
        
        # Update all interval bars
        for interval in TimeInterval:
            self._update_interval_bar(feed_id, interval, price, current_time)
        
        # After all intervals are updated, send notifications
        await self._send_interval_notifications(feed_id)
    
    def get_latest_bars(self, feed_id: str, interval: TimeInterval, limit: int = 100) -> List[OHLCBar]:
        """
        Get the latest OHLC bars for a feed and interval.
        
        Args:
            feed_id: Pyth feed ID
            interval: Time interval
            limit: Maximum number of bars to return
            
        Returns:
            List of OHLC bars, newest first
        """
        if feed_id not in self.bars or interval not in self.bars[feed_id]:
            return []
            
        # Return bars in reverse order (newest first)
        return list(reversed(self.bars[feed_id][interval][-limit:]))
    
    def get_bar_at_time(self, feed_id: str, interval: TimeInterval, timestamp: datetime) -> Optional[OHLCBar]:
        """
        Get a specific bar at a given time.
        
        Args:
            feed_id: Pyth feed ID
            interval: Time interval
            timestamp: Timestamp to search for
            
        Returns:
            OHLC bar if found, None otherwise
        """
        if feed_id not in self.bars or interval not in self.bars[feed_id]:
            return None
            
        # Normalize the timestamp to the start of the interval
        normalized_time = self._normalize_time(timestamp, interval)
        
        # Find the bar
        for bar in self.bars[feed_id][interval]:
            if bar.timestamp == normalized_time:
                return bar
                
        return None
    
    def _update_interval_bar(self, feed_id: str, interval: TimeInterval, price: float, timestamp: datetime):
        """
        Update or create a bar for a specific interval.
        
        Args:
            feed_id: Pyth feed ID
            interval: Time interval
            price: Current price
            timestamp: Current timestamp
        """
        # Normalize timestamp to the start of the interval
        normalized_time = self._normalize_time(timestamp, interval)
        
        # Find existing bar for this interval if any
        current_bar = None
        if feed_id in self.bars and interval in self.bars[feed_id]:
            bars = self.bars[feed_id][interval]
            if bars and bars[-1].timestamp == normalized_time:
                current_bar = bars[-1]
        
        if current_bar:
            # Update existing bar
            if current_bar.update_with_price(price):
                # Mark this interval as having an updated bar
                self.updated_intervals[feed_id][interval] = "bar_update"
        else:
            # Create new bar
            symbol = self.feed_symbols.get(feed_id, feed_id)
            new_bar = OHLCBar(
                feed_id=feed_id,
                symbol=symbol,
                interval=interval,
                timestamp=normalized_time,
                open=price,
                high=price,
                low=price,
                close=price
            )
            
            # Mark the previous bar as confirmed if it exists
            if feed_id in self.bars and interval in self.bars[feed_id] and self.bars[feed_id][interval]:
                prev_bar = self.bars[feed_id][interval][-1]
                if not prev_bar.confirmed:
                    prev_bar.confirmed = True
                    # Mark this interval as having an updated bar (confirmation)
                    self.updated_intervals[feed_id][interval] = "bar_update"
            
            # Add the new bar
            self.bars[feed_id][interval].append(new_bar)
            
            # Limit the number of bars stored (keep last 1000)
            if len(self.bars[feed_id][interval]) > 1000:
                self.bars[feed_id][interval] = self.bars[feed_id][interval][-1000:]
            
            # Mark this interval as having a new bar
            self.updated_intervals[feed_id][interval] = "new_bar"
            self.new_bar_intervals[feed_id].add(interval)
    
    def _normalize_time(self, timestamp: datetime, interval: TimeInterval) -> datetime:
        """
        Normalize a timestamp to the start of the interval.
        
        Args:
            timestamp: Timestamp to normalize
            interval: Time interval
            
        Returns:
            Normalized timestamp
        """
        if interval == TimeInterval.ONE_MINUTE:
            # Round to the start of the minute
            return timestamp.replace(second=0, microsecond=0)
        elif interval == TimeInterval.FIVE_MINUTES:
            # Round to the nearest 5-minute mark
            minutes = timestamp.minute - (timestamp.minute % 5)
            return timestamp.replace(minute=minutes, second=0, microsecond=0)
        elif interval == TimeInterval.FIFTEEN_MINUTES:
            # Round to the nearest 15-minute mark
            minutes = timestamp.minute - (timestamp.minute % 15)
            return timestamp.replace(minute=minutes, second=0, microsecond=0)
        elif interval == TimeInterval.THIRTY_MINUTES:
            # Round to the nearest 30-minute mark
            minutes = timestamp.minute - (timestamp.minute % 30)
            return timestamp.replace(minute=minutes, second=0, microsecond=0)
        elif interval == TimeInterval.ONE_HOUR:
            # Round to the start of the hour
            return timestamp.replace(minute=0, second=0, microsecond=0)
        elif interval == TimeInterval.FOUR_HOURS:
            # Round to the nearest 4-hour mark
            hours = timestamp.hour - (timestamp.hour % 4)
            return timestamp.replace(hour=hours, minute=0, second=0, microsecond=0)
        elif interval == TimeInterval.ONE_DAY:
            # Round to the start of the day
            return timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            # Unsupported interval
            raise ValueError(f"Unsupported interval: {interval}")
    
    async def _send_interval_notifications(self, feed_id: str):
        """
        Send notifications for all updated intervals of a feed.
        
        Args:
            feed_id: The Pyth feed ID
        """
        # Skip if no intervals were updated
        if feed_id not in self.updated_intervals or not self.updated_intervals[feed_id]:
            return
            
        # Process each updated interval
        for interval, event_type in self.updated_intervals[feed_id].items():
            # Get the latest bar for this interval
            if feed_id in self.bars and interval in self.bars[feed_id] and self.bars[feed_id][interval]:
                bar = self.bars[feed_id][interval][-1]
                
                # Get subscribers for this feed and interval
                subscribers = set()
                if feed_id in self.subscribers:
                    for client_id, intervals in self.subscribers[feed_id].items():
                        if interval in intervals:
                            subscribers.add(client_id)
                
                # Execute callbacks only if there are subscribers
                if subscribers:
                    tasks = []
                    for callback in self.callbacks:
                        try:
                            result = callback(bar, event_type, subscribers)
                            if asyncio.iscoroutine(result):
                                tasks.append(result)
                        except Exception as e:
                            self.logger.error(f"Error executing callback for interval {interval}: {e}")
                    
                    # Wait for all async callbacks to complete
                    if tasks:
                        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _notify_bar(self, bar: OHLCBar, event_type: str, specific_clients: Set[str] = None):
        """
        Notify specific clients about a bar update.
        Used primarily for sending historical data when a client subscribes.
        
        Args:
            bar: The bar to notify about
            event_type: Type of event ("bar_update" or "new_bar")
            specific_clients: Set of client IDs to notify
        """
        if specific_clients is None or not specific_clients:
            return
            
        # Execute callbacks for the specific clients
        tasks = []
        for callback in self.callbacks:
            try:
                result = callback(bar, event_type, specific_clients)
                if asyncio.iscoroutine(result):
                    tasks.append(result)
            except Exception as e:
                self.logger.error(f"Error executing callback: {e}")
        
        # Wait for all async callbacks to complete
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _check_bar_expiry(self):
        """
        Periodically check for bars that should be expired/confirmed.
        """
        while self._running:
            try:
                current_time = datetime.now()
                
                # Track which feeds and intervals need notifications
                feeds_to_notify = set()
                
                for feed_id, intervals in self.bars.items():
                    # Reset tracking for this feed
                    self.updated_intervals[feed_id].clear()
                    
                    for interval, bars in intervals.items():
                        if not bars:
                            continue
                            
                        latest_bar = bars[-1]
                        interval_duration = self.interval_durations[interval]
                        bar_end_time = latest_bar.timestamp + interval_duration
                        
                        # If the bar's end time has passed and it's not confirmed yet
                        if current_time >= bar_end_time and not latest_bar.confirmed:
                            latest_bar.confirmed = True
                            # Mark this interval as having an updated bar
                            self.updated_intervals[feed_id][interval] = "bar_update"
                            feeds_to_notify.add(feed_id)
                
                # Send notifications for all updated feeds
                for feed_id in feeds_to_notify:
                    await self._send_interval_notifications(feed_id)
                
                # Sleep for a short time
                await asyncio.sleep(1)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in bar expiry check: {e}")
                await asyncio.sleep(5)  # Longer sleep on error