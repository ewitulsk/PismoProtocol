use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use futures_util::{SinkExt, StreamExt};
use ratatui::{
    backend::{Backend, CrosstermBackend},
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{
        Block, Borders, Paragraph,
        canvas::Canvas,
    },
    Frame, Terminal,
};
use std::{
    collections::{HashMap, VecDeque},
    io,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime},
};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info};
use url::Url;
use chrono::{DateTime, Utc};

// Import shared types from the server crate
use chart_builder_server::{ChartMessage, ChartResponse, AssetInfo};

#[derive(Clone, Debug)]
pub struct OHLCBar {
    pub timestamp: DateTime<Utc>,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

impl OHLCBar {
    pub fn is_bullish(&self) -> bool {
        self.close >= self.open
    }
    
    pub fn body_top(&self) -> f64 {
        self.open.max(self.close)
    }
    
    pub fn body_bottom(&self) -> f64 {
        self.open.min(self.close)
    }
}

#[derive(Clone, Debug)]
pub struct AssetData {
    pub asset_id: String,
    pub time_scale: String,
    pub bars: VecDeque<OHLCBar>,
    pub last_update: DateTime<Utc>,
}

impl AssetData {
    pub fn new(asset_id: String, time_scale: String) -> Self {
        Self {
            asset_id,
            time_scale,
            bars: VecDeque::new(),
            last_update: Utc::now(),
        }
    }

    pub fn add_bar(&mut self, bar: OHLCBar) {
        // Keep only last 50 bars for display (better for terminal width)
        if self.bars.len() >= 50 {
            self.bars.pop_front();
        }
        self.bars.push_back(bar);
        self.last_update = Utc::now();
    }

    pub fn update_latest_bar(&mut self, bar: OHLCBar) {
        if let Some(last_bar) = self.bars.back_mut() {
            if last_bar.timestamp == bar.timestamp {
                *last_bar = bar;
                self.last_update = Utc::now();
                return;
            }
        }
        // If we couldn't update, add as new bar
        self.add_bar(bar);
    }
}

pub struct App {
    pub should_quit: bool,
    pub asset_data: HashMap<String, AssetData>,
    pub selected_asset: Option<String>,
    pub available_assets: Vec<AssetInfo>,
    pub connection_status: String,
    pub last_update: DateTime<Utc>,
}

impl App {
    pub fn new() -> Self {
        Self {
            should_quit: false,
            asset_data: HashMap::new(),
            selected_asset: None,
            available_assets: Vec::new(),
            connection_status: "Connecting...".to_string(),
            last_update: Utc::now(),
        }
    }

    pub fn quit(&mut self) {
        self.should_quit = true;
    }

    pub fn add_asset_data(&mut self, asset_id: String, time_scale: String) {
        let key = format!("{}_{}", asset_id, time_scale);
        // Only create asset data if it doesn't already exist to avoid overwriting existing bars
        if !self.asset_data.contains_key(&key) {
            self.asset_data.insert(key.clone(), AssetData::new(asset_id.clone(), time_scale));
        }
        if self.selected_asset.is_none() {
            self.selected_asset = Some(key);
        }
    }

    pub fn update_bar(&mut self, asset_id: &str, time_scale: &str, bar: OHLCBar, is_new: bool) {
        let key = format!("{}_{}", asset_id, time_scale);
        if let Some(data) = self.asset_data.get_mut(&key) {
            if is_new {
                data.add_bar(bar);
            } else {
                data.update_latest_bar(bar);
            }
        } else {
            let mut data = AssetData::new(asset_id.to_string(), time_scale.to_string());
            data.add_bar(bar);
            self.asset_data.insert(key.clone(), data);
            if self.selected_asset.is_none() {
                self.selected_asset = Some(key);
            }
        }
        self.last_update = Utc::now();
    }

    pub fn set_bars(&mut self, asset_id: &str, time_scale: &str, bars: Vec<OHLCBar>) {
        let key = format!("{}_{}", asset_id, time_scale);
        let mut data = AssetData::new(asset_id.to_string(), time_scale.to_string());
        
        // Add all bars, keeping only the last 50 for display
        for bar in bars {
            data.add_bar(bar);
        }
        
        self.asset_data.insert(key.clone(), data);
        if self.selected_asset.is_none() {
            self.selected_asset = Some(key);
        }
        self.last_update = Utc::now();
    }
}

pub async fn run_app<B: Backend>(
    terminal: &mut Terminal<B>,
    app: Arc<Mutex<App>>,
    mut rx: mpsc::Receiver<String>,
) -> io::Result<()> {
    let mut last_tick = SystemTime::now();
    let tick_rate = Duration::from_millis(250);

    loop {
        let timeout = tick_rate
            .checked_sub(last_tick.elapsed().unwrap_or(Duration::ZERO))
            .unwrap_or(Duration::ZERO);

        // Handle events
        if crossterm::event::poll(timeout)? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char('q') => {
                        app.lock().unwrap().quit();
                        break;
                    }
                    KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                        app.lock().unwrap().quit();
                        break;
                    }
                    KeyCode::Char('1'..='9') => {
                        if let Some(digit) = key.code.to_string().chars().next() {
                            if let Some(index) = digit.to_digit(10) {
                                let index = (index - 1) as usize;
                                let app_guard = app.lock().unwrap();
                                let keys: Vec<_> = app_guard.asset_data.keys().cloned().collect();
                                if index < keys.len() {
                                    drop(app_guard);
                                    app.lock().unwrap().selected_asset = Some(keys[index].clone());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        // Handle WebSocket messages
        if let Ok(_message) = rx.try_recv() {
            // Process WebSocket message (this will be handled by the WebSocket task)
        }

        if SystemTime::now().duration_since(last_tick).unwrap() >= tick_rate {
            terminal.draw(|f| ui(f, &app.lock().unwrap()))?;
            last_tick = SystemTime::now();
        }

        if app.lock().unwrap().should_quit {
            break;
        }
    }

    Ok(())
}

fn ui(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Header
            Constraint::Min(10),   // Chart
            Constraint::Length(3), // Footer
        ])
        .split(f.area());

    // Header
    let header = Paragraph::new(vec![
        Line::from(vec![
            Span::styled("Pismo Protocol ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
            Span::styled("Trading Chart", Style::default().fg(Color::White)),
        ]),
        Line::from(vec![
            Span::styled("Status: ", Style::default().fg(Color::Yellow)),
            Span::styled(&app.connection_status, 
                if app.connection_status.contains("Connected") { 
                    Style::default().fg(Color::Green) 
                } else { 
                    Style::default().fg(Color::Red) 
                }
            ),
            Span::styled(" | Press 'q' or Ctrl+C to quit, 1-9 to switch assets", Style::default().fg(Color::Gray)),
        ]),
    ])
    .block(Block::default().borders(Borders::ALL).title("Status"))
    .alignment(Alignment::Center);
    f.render_widget(header, chunks[0]);

    // Chart
    if let Some(selected_key) = &app.selected_asset {
        if let Some(data) = app.asset_data.get(selected_key) {
            render_ohlc_chart(f, chunks[1], data);
        } else {
            let placeholder = Paragraph::new("No data available")
                .block(Block::default().borders(Borders::ALL).title("Chart"))
                .alignment(Alignment::Center);
            f.render_widget(placeholder, chunks[1]);
        }
    } else {
        let placeholder = Paragraph::new("No asset selected")
            .block(Block::default().borders(Borders::ALL).title("Chart"))
            .alignment(Alignment::Center);
        f.render_widget(placeholder, chunks[1]);
    }

    // Footer with asset list and stats
    let footer_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(70), Constraint::Percentage(30)])
        .split(chunks[2]);

    // Asset list
    let assets_text = if app.asset_data.is_empty() {
        "No assets loaded".to_string()
    } else {
        app.asset_data
            .keys()
            .enumerate()
            .map(|(i, key)| {
                let marker = if Some(key) == app.selected_asset.as_ref() { "►" } else { " " };
                format!("{}{}. {}", marker, i + 1, key)
            })
            .collect::<Vec<_>>()
            .join(" | ")
    };

    let assets = Paragraph::new(assets_text)
        .block(Block::default().borders(Borders::ALL).title("Assets"))
        .wrap(ratatui::widgets::Wrap { trim: true });
    f.render_widget(assets, footer_chunks[0]);

    // Current price info
    let price_info = if let Some(selected_key) = &app.selected_asset {
        if let Some(data) = app.asset_data.get(selected_key) {
            if let Some(latest_bar) = data.bars.back() {
                let trend = if latest_bar.is_bullish() { "🟢" } else { "🔴" };
                format!(
                    "{} O: {:.2} H: {:.2} L: {:.2} C: {:.2}\nVol: {:.2} | Bars: {}",
                    trend,
                    latest_bar.open,
                    latest_bar.high,
                    latest_bar.low,
                    latest_bar.close,
                    latest_bar.volume,
                    data.bars.len()
                )
            } else {
                "No data".to_string()
            }
        } else {
            "No data".to_string()
        }
    } else {
        "No selection".to_string()
    };

    let stats = Paragraph::new(price_info)
        .block(Block::default().borders(Borders::ALL).title("Stats"))
        .alignment(Alignment::Center);
    f.render_widget(stats, footer_chunks[1]);
}

fn render_ohlc_chart(f: &mut Frame, area: Rect, data: &AssetData) {
    if data.bars.is_empty() {
        return;
    }

    let bars_vec: Vec<_> = data.bars.iter().collect();
    
    // Find price range
    let mut min_price = f64::MAX;
    let mut max_price = f64::MIN;
    
    for bar in &bars_vec {
        min_price = min_price.min(bar.low);
        max_price = max_price.max(bar.high);
    }
    
    // Add some padding
    let padding = (max_price - min_price) * 0.1;
    min_price -= padding;
    max_price += padding;

    let bar_count = bars_vec.len() as f64;
    
    // Create title with asset info
    let title = format!("OHLC Chart - {} ({})", data.asset_id, data.time_scale);
    
    let canvas = Canvas::default()
        .block(Block::default().borders(Borders::ALL).title(title))
        .x_bounds([0.0, bar_count])
        .y_bounds([min_price, max_price])
        .paint(|ctx| {
            for (i, bar) in bars_vec.iter().enumerate() {
                let x = i as f64 + 0.5; // Center the bar
                let color = if bar.is_bullish() { Color::Green } else { Color::Red };
                
                // Draw the wick (high-low line)
                draw_line(ctx, x, bar.low, x, bar.high, color);
                
                // Draw the body (open-close rectangle)
                let body_top = bar.body_top();
                let body_bottom = bar.body_bottom();
                let body_height = body_top - body_bottom;
                
                // For very thin bodies (like doji), ensure minimum visibility
                let min_body_height = (max_price - min_price) * 0.005; // Increased minimum height
                let actual_body_height = body_height.max(min_body_height);
                
                // Make bars wider and more filled
                let bar_width = 0.4; // Wider bars
                
                // Draw body as a densely filled rectangle
                draw_filled_rect(ctx, x - bar_width, body_bottom, x + bar_width, body_bottom + actual_body_height, color);
                
                // For extra filling, draw additional passes with slight offsets
                draw_filled_rect(ctx, x - bar_width + 0.05, body_bottom, x + bar_width - 0.05, body_bottom + actual_body_height, color);
                
                // Note: Time labels would need to be implemented with additional chart layers
            }
        });

    f.render_widget(canvas, area);
}

// Helper function to draw a line in the canvas
fn draw_line(ctx: &mut ratatui::widgets::canvas::Context, x1: f64, y1: f64, x2: f64, y2: f64, color: Color) {
    // Draw a thicker, more visible line
    let steps = ((y2 - y1).abs() * 20.0).max(2.0) as i32; // More steps for better line quality
    for i in 0..=steps {
        let t = i as f64 / steps as f64;
        let x = x1 + t * (x2 - x1);
        let y = y1 + t * (y2 - y1);
        ctx.print(x, y, Span::styled("│", Style::default().fg(color)));
        // Draw a slightly thicker wick
        ctx.print(x + 0.05, y, Span::styled("│", Style::default().fg(color)));
        ctx.print(x - 0.05, y, Span::styled("│", Style::default().fg(color)));
    }
}

// Helper function to draw a filled rectangle
fn draw_filled_rect(ctx: &mut ratatui::widgets::canvas::Context, x1: f64, y1: f64, x2: f64, y2: f64, color: Color) {
    // Increase density significantly for better filling
    let steps_x = ((x2 - x1).abs() * 50.0).max(3.0) as i32;
    let steps_y = ((y2 - y1).abs() * 30.0).max(2.0) as i32;
    
    for i in 0..=steps_x {
        for j in 0..=steps_y {
            let x = x1 + (i as f64 / steps_x as f64) * (x2 - x1);
            let y = y1 + (j as f64 / steps_y as f64) * (y2 - y1);
            ctx.print(x, y, Span::styled("█", Style::default().fg(color)));
        }
    }
}

pub struct ChartClient {
    url: String,
    last_timestamps: HashMap<String, DateTime<Utc>>,
    app: Arc<Mutex<App>>,
}

impl ChartClient {
    pub fn new(url: String, app: Arc<Mutex<App>>) -> Self {
        Self {
            url,
            last_timestamps: HashMap::new(),
            app,
        }
    }

    pub async fn connect_and_run(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let url = Url::parse(&self.url)?;
        let (ws_stream, _) = connect_async(url).await?;
        let (mut write, mut read) = ws_stream.split();

        info!("Connected to chart server");
        self.app.lock().unwrap().connection_status = "Connected".to_string();

        // Request available assets
        let get_assets_msg = ChartMessage::GetAssets;
        let get_assets_json = serde_json::to_string(&get_assets_msg)?;
        write.send(Message::Text(get_assets_json)).await?;

        // Subscribe to SOL 10s charts
        let subscribe_msg = ChartMessage::Subscribe {
            asset_id: "fe650f0367d4a7ef9815a593ea15d36593f0643aaaf0149bb04be67ab851decd".to_string(),
            time_scale: "10s".to_string(),
        };
        let subscribe_json = serde_json::to_string(&subscribe_msg)?;
        write.send(Message::Text(subscribe_json)).await?;

        // Listen for responses
        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    if let Ok(response) = serde_json::from_str::<ChartResponse>(&text) {
                        match response {
                            ChartResponse::Assets { assets } => {
                                info!("Available assets: {:?}", assets);
                                self.app.lock().unwrap().available_assets = assets;
                            }
                            ChartResponse::SubscriptionConfirmed { asset_id, time_scale } => {
                                info!("Subscribed to {} - {}", asset_id, time_scale);
                                self.app.lock().unwrap().add_asset_data(asset_id, time_scale);
                            }
                            ChartResponse::BarUpdate { asset_id, time_scale, bar } => {
                                let key = format!("{}_{}", asset_id, time_scale);
                                let is_new_bar = if let Some(last_timestamp) = self.last_timestamps.get(&key) {
                                    bar.timestamp != *last_timestamp
                                } else {
                                    true // First bar we've seen
                                };
                                
                                self.last_timestamps.insert(key, bar.timestamp);
                                
                                let ohlc_bar = OHLCBar {
                                    timestamp: bar.timestamp,
                                    open: bar.open,
                                    high: bar.high,
                                    low: bar.low,
                                    close: bar.close,
                                    volume: bar.volume,
                                };
                                
                                self.app.lock().unwrap().update_bar(&asset_id, &time_scale, ohlc_bar, is_new_bar);
                            }
                            ChartResponse::BarsData { asset_id, time_scale, bars } => {
                                info!("Received {} bars for {} - {}", bars.len(), asset_id, time_scale);
                                
                                // Update the last timestamp based on the last bar
                                let key = format!("{}_{}", asset_id, time_scale);
                                if let Some(last_bar) = bars.last() {
                                    self.last_timestamps.insert(key, last_bar.timestamp);
                                }
                                
                                // Convert all bars at once
                                let ohlc_bars: Vec<OHLCBar> = bars.iter().map(|bar| OHLCBar {
                                    timestamp: bar.timestamp,
                                    open: bar.open,
                                    high: bar.high,
                                    low: bar.low,
                                    close: bar.close,
                                    volume: bar.volume,
                                }).collect();
                                
                                // Set all bars at once - much more efficient
                                self.app.lock().unwrap().set_bars(&asset_id, &time_scale, ohlc_bars);
                            }
                            ChartResponse::Error { message } => {
                                error!("Server error: {}", message);
                                self.app.lock().unwrap().connection_status = format!("Error: {}", message);
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("Connection closed");
                    self.app.lock().unwrap().connection_status = "Disconnected".to_string();
                    break;
                }
                Err(e) => {
                    error!("Error reading message: {}", e);
                    self.app.lock().unwrap().connection_status = format!("Error: {}", e);
                    break;
                }
                _ => {}
            }
        }

        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app state
    let app = Arc::new(Mutex::new(App::new()));
    let app_clone = app.clone();

    // Create channel for communication
    let (_tx, rx) = mpsc::channel(100);

    // Create and run WebSocket client in a separate task
    let mut client = ChartClient::new("ws://127.0.0.1:8080".to_string(), app_clone);
    let ws_handle = tokio::spawn(async move {
        if let Err(e) = client.connect_and_run().await {
            error!("WebSocket client error: {}", e);
        }
    });

    // Run the app
    let res = run_app(&mut terminal, app, rx).await;

    // restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    // Cancel the WebSocket task
    ws_handle.abort();

    if let Err(err) = res {
        println!("{err:?}");
    }

    Ok(())
} 