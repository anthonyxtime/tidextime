// ╔══════════════════════════════════════════════════════════════════════╗
// ║  TideTrack.jsx                                                       ║
// ║  Main app component — tide chart, buoy data, moon phase              ║
// ║  Data sources: NOAA CO-OPS (tides), NDBC (buoys)                     ║
// ╚══════════════════════════════════════════════════════════════════════╝

// React hooks we use throughout the app:
//   useState    = store values that can change (like which station is selected)
//   useEffect   = run code when something happens (like fetching data on load)
//   useRef      = store a value that doesn't trigger a re-render (like the SVG element)
//   useCallback = memoize a function so it isn't recreated every render (perf)
import { useState, useEffect, useRef, useCallback } from "react";


// ════════════════════════════════════════════════════════════════════════
// STATION DATABASE
// Each entry has:
//   region  = used to group stations in the picker dropdown
//   name    = display name
//   id      = NOAA CO-OPS station ID (used in the API call)
//   lat/lon = used to calculate sun times for the day/night background
//   buoy    = nearest NDBC buoy ID for wave/swell data
// ════════════════════════════════════════════════════════════════════════
const STATIONS = [
  { region:"S. California", name:"Santa Monica Bay, CA",   id:"9410840", lat:33.998, lon:-118.497, buoy:"46025" },
  { region:"S. California", name:"Los Angeles Harbor, CA", id:"9410660", lat:33.720, lon:-118.272, buoy:"46025" },
  { region:"S. California", name:"Newport Beach, CA",      id:"9410580", lat:33.615, lon:-117.878, buoy:"46086" },
  { region:"S. California", name:"San Diego, CA",          id:"9410170", lat:32.714, lon:-117.174, buoy:"46086" },
  { region:"S. California", name:"Santa Barbara, CA",      id:"9411340", lat:34.408, lon:-119.685, buoy:"46054" },
  { region:"N. California", name:"Santa Cruz, CA",         id:"9413745", lat:36.958, lon:-122.017, buoy:"46042" },
  { region:"N. California", name:"Monterey, CA",           id:"9413450", lat:36.605, lon:-121.888, buoy:"46042" },
  { region:"N. California", name:"San Francisco, CA",      id:"9414290", lat:37.807, lon:-122.465, buoy:"46026" },
  { region:"N. California", name:"Crescent City, CA",      id:"9419750", lat:41.745, lon:-124.184, buoy:"46027" },
  { region:"Pacific NW",    name:"Newport, OR",            id:"9435380", lat:44.625, lon:-124.049, buoy:"46050" },
  { region:"Pacific NW",    name:"Astoria, OR",            id:"9439040", lat:46.207, lon:-123.769, buoy:"46027" },
  { region:"Pacific NW",    name:"Westport, WA",           id:"9441102", lat:46.904, lon:-124.105, buoy:"46029" },
  { region:"Pacific NW",    name:"Seattle, WA",            id:"9447130", lat:47.602, lon:-122.339, buoy:"46088" },
  { region:"Hawaii",        name:"Honolulu, Oahu",         id:"1612340", lat:21.307, lon:-157.867, buoy:"51201" },
  { region:"Hawaii",        name:"Hilo, Big Island",       id:"1617760", lat:19.730, lon:-155.060, buoy:"51206" },
  { region:"Hawaii",        name:"Kahului, Maui",          id:"1615680", lat:20.895, lon:-156.473, buoy:"51201" },
  { region:"Hawaii",        name:"Nawiliwili, Kauai",      id:"1611400", lat:21.954, lon:-159.356, buoy:"51001" },
  { region:"East Coast",    name:"Montauk, NY",            id:"8510560", lat:41.049, lon:-71.957,  buoy:"44025" },
  { region:"East Coast",    name:"New York, NY",           id:"8518750", lat:40.700, lon:-74.015,  buoy:"44025" },
  { region:"East Coast",    name:"Virginia Beach, VA",     id:"8638610", lat:36.947, lon:-76.330,  buoy:"44014" },
  { region:"East Coast",    name:"Cape Hatteras, NC",      id:"8654467", lat:35.214, lon:-75.690,  buoy:"41025" },
  { region:"East Coast",    name:"Miami, FL",              id:"8723214", lat:25.768, lon:-80.133,  buoy:"41047" },
  { region:"Gulf Coast",    name:"Galveston, TX",          id:"8771341", lat:29.310, lon:-94.793,  buoy:"42035" },
];


// ════════════════════════════════════════════════════════════════════════
// OVERLAY REGISTRY
// This is the expandable layer system. To add a new overlay in the future
// (e.g. wind, swell forecast), just add an entry here and build its panel
// below. The toggle buttons are generated automatically from this list.
//   live:true  = overlay is built and active
//   live:false = placeholder shown as "COMING SOON"
// ════════════════════════════════════════════════════════════════════════
const OVERLAYS = [
  { id:"buoy",      label:"BUOY",       icon:"🔴", color:"#ff7a45", live:true  },
  { id:"moon",      label:"MOON",       icon:"🌙", color:"#e8c040", live:true  },
  { id:"wind",      label:"WIND",       icon:"💨", color:"#4af0a0", live:false, soon:true },
  { id:"multibuoy", label:"MULTI-BUOY", icon:"📊", color:"#a0b4ff", live:false, soon:true },
];


// ════════════════════════════════════════════════════════════════════════
// Y-AXIS CONSTANTS
// Fixed range: -1 to 7 ft covers virtually all of SoCal, Hawaii, and most
// of the East Coast without wasted space. If data exceeds this range
// (e.g. Seattle's 14ft tides), an "EXPAND Y-AXIS" button appears.
// ════════════════════════════════════════════════════════════════════════
const Y_FIXED_MIN   = -1;
const Y_FIXED_MAX   =  7;
const Y_FIXED_TICKS = [-1, 0, 1, 2, 3, 4, 5, 6, 7];


// ════════════════════════════════════════════════════════════════════════
// MOON PHASE CALCULATION
// Based on a known new moon date and the 29.53-day lunar cycle.
// Returns a number 0–29.53 representing days into the current cycle.
// ════════════════════════════════════════════════════════════════════════
function getMoonPhase(date) {
  const knownNewMoon = new Date(2000, 0, 6, 18, 14, 0); // Jan 6, 2000 new moon
  const cycleDays    = 29.530588853;
  return (((date - knownNewMoon) / 86400000) % cycleDays + cycleDays) % cycleDays;
}

// Maps moon phase day → emoji + name
const MOON_TABLE = [
  [1.85,  "🌑", "New Moon"],
  [5.54,  "🌒", "Waxing Crescent"],
  [9.22,  "🌓", "First Quarter"],
  [12.91, "🌔", "Waxing Gibbous"],
  [16.61, "🌕", "Full Moon"],
  [20.30, "🌖", "Waning Gibbous"],
  [23.99, "🌗", "Last Quarter"],
  [99,    "🌘", "Waning Crescent"],
];
function moonInfo(phase) {
  return MOON_TABLE.find(([max]) => phase < max) || MOON_TABLE[7];
}


// ════════════════════════════════════════════════════════════════════════
// SUN TIMES CALCULATION
// Uses the station's lat/lon + today's date to calculate:
//   firstLight  = start of civil twilight (dawn) — in minutes from midnight
//   sunrise     = sun crosses horizon
//   sunset      = sun crosses horizon (evening)
//   lastLight   = end of civil twilight (dusk)
// These drive the day/night background shading on the chart.
// Note: uses the browser's local timezone offset, so times match
// your phone's clock even when viewing a remote station.
// ════════════════════════════════════════════════════════════════════════
function getSunTimes(lat, lon, date) {
  const toRad = d => d * Math.PI / 180;

  // Day of year (1–365)
  const N = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);

  // Solar angle for this day
  const B = toRad((360 / 365) * (N - 81));

  // Equation of time (minutes) — corrects for Earth's elliptical orbit
  const EqT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  // Solar declination (axial tilt effect)
  const decl = toRad(23.45 * Math.sin(toRad((360 / 365) * (N - 81))));
  const latR  = toRad(lat);

  // Solar noon in local minutes from midnight
  // getTimezoneOffset() returns minutes west of UTC (negative = east)
  const solarNoon = 720 - 4 * lon - EqT - date.getTimezoneOffset();

  // Calculate half-day span for a given solar altitude angle
  const halfSpan = altDeg => {
    const cosH = (Math.sin(toRad(altDeg)) - Math.sin(latR) * Math.sin(decl))
               / (Math.cos(latR) * Math.cos(decl));
    if (cosH >= 1 || cosH <= -1) return null; // sun never rises/sets (polar)
    return Math.acos(cosH) * (180 / Math.PI) * 4; // convert to minutes
  };

  const sr = halfSpan(-0.833); // sunrise/sunset: -0.833° accounts for refraction
  const ct = halfSpan(-6);     // civil twilight: -6° below horizon

  // Polar edge case — always day or always night
  if (!sr) return { firstLight: 0, sunrise: 0, sunset: 1440, lastLight: 1440 };

  return {
    firstLight : Math.round(solarNoon - (ct ?? sr + 30)),
    sunrise    : Math.round(solarNoon - sr),
    sunset     : Math.round(solarNoon + sr),
    lastLight  : Math.round(solarNoon + (ct ?? sr + 30)),
  };
}


// ════════════════════════════════════════════════════════════════════════
// CATMULL-ROM SPLINE INTERPOLATION
// NOAA gives us only the hi/lo turning points (typically 3–4 per day).
// This function smoothly interpolates between them to get the tide height
// at any minute of the day — producing the smooth S-curve you see.
// Catmull-Rom is ideal here: it passes exactly through the hi/lo points
// and produces natural-looking curves without overshoot.
// ════════════════════════════════════════════════════════════════════════
function interpTide(pts, min) {
  if (!pts?.length) return 0;
  if (min <= pts[0].t_minutes) return pts[0].v;
  if (min >= pts[pts.length - 1].t_minutes) return pts[pts.length - 1].v;

  // Find the segment containing our target minute
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].t_minutes < min) i++;

  // Four control points (p0 and p3 are the neighbors outside the segment)
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];

  // t = how far we are through this segment (0.0 to 1.0)
  const t  = (min - p1.t_minutes) / (p2.t_minutes - p1.t_minutes);
  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom formula
  return 0.5 * (
      2 * p1.v
    + (-p0.v + p2.v) * t
    + (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * t2
    + (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * t3
  );
}


// ════════════════════════════════════════════════════════════════════════
// UNIT & TIME HELPERS
// ════════════════════════════════════════════════════════════════════════

// Convert feet to meters
const ftToM = v => v * 0.3048;

// Apply unit conversion based on metric flag
const cvt = (v, metric) => metric ? ftToM(v) : v;

// Format a value to 2 decimal places (used for the big tide readout)
const fmtV  = (v, metric) => cvt(v, metric).toFixed(2);

// Format a value with unit suffix (used for hi/lo labels on chart)
const fmtVs = (v, metric) => `${cvt(v, metric).toFixed(1)} ${metric ? "m" : "ft"}`;

// Unit label string
const uLbl  = metric => metric ? "m" : "ft";

// Format minutes-from-midnight as a readable time string
// short=true → "5:27am"    short=false → "5:27 AM"
function fmtMin(min, short = false) {
  const h  = Math.floor(min / 60) % 24;
  const mm = Math.round(min % 60);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const mmStr = String(mm).padStart(2, "0");
  return short
    ? `${h12}:${mmStr}${ap.toLowerCase()}`
    : `${h12}:${mmStr} ${ap}`;
}

// Current local time string (for the clock in the header)
const nowLocal = () =>
  new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:true });

// Current UTC time string
const nowUTC = () => {
  const d = new Date();
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};


// ════════════════════════════════════════════════════════════════════════
// CHART LAYOUT CONSTANTS
// The SVG "canvas" is 400×210 units (these are not pixels — they scale
// to fill whatever width the container is, staying proportional).
// PAD defines the inner margins so labels don't get clipped.
// ════════════════════════════════════════════════════════════════════════
const VW  = 400;  // SVG viewBox width
const VH  = 210;  // SVG viewBox height
const PAD = { t: 22, b: 26, l: 40, r: 10 }; // top/bottom/left/right padding
const CW  = VW - PAD.l - PAD.r;  // chart drawing width
const CH  = VH - PAD.t - PAD.b;  // chart drawing height

// Converts a time in minutes (0–1440) to an X coordinate in SVG space
const xOf = min => PAD.l + (min / 1440) * CW;

// Hour tick marks and their display labels
const HTICKS = [0, 3, 6, 9, 12, 15, 18, 21];
const HLBLS  = ["12am", "3am", "6am", "9am", "Noon", "3pm", "6pm", "9pm"];

// Demo fallback data — used if the NOAA fetch fails (e.g. in this chat sandbox)
// Represents a typical Santa Monica day with two highs and one low
const DEMO = [
  { t_minutes: 327,  v: 4.3,  type: "H" },
  { t_minutes: 745,  v: -0.2, type: "L" },
  { t_minutes: 1152, v: 4.3,  type: "H" },
];


// ════════════════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// Everything below is the React component — the living, interactive app.
// React re-renders this function whenever state changes, keeping the UI
// in sync with data automatically.
// ════════════════════════════════════════════════════════════════════════
export default function TideTrack() {

  // ── App state ──────────────────────────────────────────────────────────
  const [stIdx,      setStIdx]      = useState(0);        // selected station index
  const [hiLos,      setHiLos]      = useState(null);     // tide hi/lo data from NOAA
  const [loading,    setLoading]    = useState(true);     // shows loading message
  const [isDemo,     setIsDemo]     = useState(false);    // true = using fallback data
  const [cursor,     setCursor]     = useState(null);     // null = pinned to "now"
  const [metric,     setMetric]     = useState(false);    // false=ft, true=m
  const [expanded,   setExpanded]   = useState(false);    // y-axis expand toggle
  const [overlays,   setOverlays]   = useState({ buoy: true, moon: true }); // panel visibility
  const [showPicker, setShowPicker] = useState(false);    // location dropdown open?
  const [, forceClk]                = useState(0);        // dummy state just to tick the clock

  // ── Refs (don't trigger re-renders) ───────────────────────────────────
  const svgRef     = useRef(null);   // reference to the SVG element for pointer math
  const dragging   = useRef(false);  // is the user currently dragging?
  const pendingMin = useRef(null);   // latest minute value from pointer move
  const rafId      = useRef(null);   // requestAnimationFrame ID for smooth drag

  // ── Derived values ─────────────────────────────────────────────────────
  const station  = STATIONS[stIdx];
  const today    = new Date();
  const nowMin   = today.getHours() * 60 + today.getMinutes(); // current time in minutes
  const sun      = getSunTimes(station.lat, station.lon, today);
  const phase    = getMoonPhase(today);
  const [, moonEmoji, moonName] = moonInfo(phase);
  const isSpring = phase < 3 || phase > 27 || (phase > 13 && phase < 17);


  // ── Clock tick every 30 seconds ────────────────────────────────────────
  // This forces a re-render so the clock display stays current.
  useEffect(() => {
    const id = setInterval(() => forceClk(n => n + 1), 30000);
    return () => clearInterval(id); // cleanup on unmount
  }, []);


  // ── NOAA tide data fetch ───────────────────────────────────────────────
  // Runs whenever stIdx changes (i.e. user picks a new station).
  // Calls the free NOAA CO-OPS API for today's hi/lo tide predictions.
  // If the fetch fails (network error, CORS in sandbox), falls back to DEMO data.
  useEffect(() => {
    setLoading(true);
    setHiLos(null);
    setCursor(null);
    setExpanded(false);

    // Format today's date as YYYYMMDD for the API
    const d = today.toISOString().slice(0, 10).replace(/-/g, "");

    const url =
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
      `?begin_date=${d}&end_date=${d}` +
      `&station=${station.id}` +
      `&product=predictions`  + // hi/lo predictions (not hourly)
      `&datum=MLLW`           + // Mean Lower Low Water — standard tide datum
      `&time_zone=lst_ldt`    + // station's local standard/daylight time
      `&interval=hilo`        + // only return turning points, not every hour
      `&units=english`        + // feet (we handle metric conversion ourselves)
      `&application=tidetrack` +
      `&format=json`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.predictions) {
          // Parse each prediction: extract hour+minute, value, and H/L type
          setHiLos(data.predictions.map(p => {
            const [hh, mm] = p.t.split(" ")[1].split(":").map(Number);
            return { t_minutes: hh * 60 + mm, v: parseFloat(p.v), type: p.type };
          }));
          setIsDemo(false);
        } else {
          // NOAA returned an error (e.g. station offline) — use demo data
          setHiLos(DEMO);
          setIsDemo(true);
        }
        setLoading(false);
      })
      .catch(() => {
        // Network/CORS error (common in chat sandbox) — use demo data
        setHiLos(DEMO);
        setIsDemo(true);
        setLoading(false);
      });
  }, [stIdx]); // ← dependency array: re-run this effect when stIdx changes


  // ── Y-axis logic ───────────────────────────────────────────────────────
  // Check if the actual data fits within the fixed -1 to 7 ft range.
  // If not, show the EXPAND button so the user can see the full picture.
  const dataMin    = hiLos ? Math.min(...hiLos.map(h => h.v)) : 0;
  const dataMax    = hiLos ? Math.max(...hiLos.map(h => h.v)) : 5;
  const needsExpand = dataMin < Y_FIXED_MIN + 0.1 || dataMax > Y_FIXED_MAX - 0.1;

  // Active range depends on whether expanded mode is on
  const yMin   = expanded ? dataMin - 0.8 : Y_FIXED_MIN;
  const yMax   = expanded ? dataMax + 0.8 : Y_FIXED_MAX;
  const yRange = yMax - yMin;

  // Y-axis tick values — fixed set normally, auto-spaced when expanded
  let yTicks;
  if (!expanded) {
    yTicks = Y_FIXED_TICKS;
  } else {
    // Pick a step size that gives ~4–6 ticks for any range
    const step = yRange > 16 ? 4 : yRange > 8 ? 2 : 1;
    yTicks = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yTicks.push(v);
  }

  // Converts a tide value (feet) to a Y coordinate in SVG space
  const yOf = v => PAD.t + CH - ((v - yMin) / yRange) * CH;


  // ── Build smooth tide curve ────────────────────────────────────────────
  // Sample the interpolation function every 5 minutes (289 points = full day).
  // More points = smoother curve; 5-min interval is imperceptible on screen.
  const curve = hiLos
    ? Array.from({ length: 289 }, (_, i) => ({ min: i * 5, v: interpTide(hiLos, i * 5) }))
    : [];

  // Convert curve points to an SVG path string (e.g. "M 40,120 L 41.2,119 ...")
  const pathD = curve.length
    ? "M " + curve.map(p => `${xOf(p.min).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(" L ")
    : "";

  // Closed path for the filled area under the curve
  const areaD = pathD
    ? `${pathD} L ${xOf(1440)},${yOf(yMin)} L ${xOf(0)},${yOf(yMin)} Z`
    : "";

  // Current cursor position and tide value
  const selMin = cursor ?? nowMin;                            // selected minute
  const selV   = hiLos ? interpTide(hiLos, selMin) : 0;     // tide at that minute

  // Next upcoming hi or lo after "now"
  const nextHL = hiLos?.find(p => p.t_minutes > nowMin);

  // Shorthand for chart top/bottom Y coordinates
  const ct = PAD.t;          // chart top
  const cb = VH - PAD.b;    // chart bottom

  // Sun times for this station
  const { firstLight, sunrise, sunset, lastLight } = sun;


  // ── 60fps smooth drag handler ──────────────────────────────────────────
  // We use requestAnimationFrame to throttle state updates to the screen's
  // refresh rate. Without this, fast finger drags would queue up hundreds
  // of state updates and feel laggy.

  // Converts a pointer/touch event to a minute value (0–1440)
  const calcMin = useCallback(e => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect  = svg.getBoundingClientRect
