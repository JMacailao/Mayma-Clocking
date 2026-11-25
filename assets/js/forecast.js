// Speed forecast: when a pigeon flying at a given speed reaches the loft.
// arrival = official release + loft distance ÷ speed (m/min), seconds rounded down
// like the club SMS forecast, shown in Philippine time.

export const FORECAST_SPEEDS=[1400,1300,1200,1100,1000,900,800,700,600,500];

// Release times are stored in UTC without a zone ("2026-11-18 22:10:00").
export const utcMs=value=>{
  if(value===null||value===undefined||value==='')return NaN;
  const text=String(value).trim().replace(' ','T');
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text)?text:`${text}Z`);
};

// One row per speed: { speed, flightSeconds, arrivalMs }. Empty when the release
// time or the distance is missing.
export function speedForecast(releaseUtc,distanceM,speeds=FORECAST_SPEEDS){
  const release=utcMs(releaseUtc),distance=Number(distanceM);
  if(!Number.isFinite(release)||!(distance>0))return [];
  return speeds.map(speed=>{const flightSeconds=Math.floor(distance/speed*60);return {speed,flightSeconds,arrivalMs:release+flightSeconds*1000};});
}

// 24-hour clock in Philippine time, to the second: "06:36:03".
const CLOCK=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:'Asia/Manila'});
export const phClock=ms=>Number.isFinite(ms)?CLOCK.format(new Date(ms)):'—';
export const flightClock=seconds=>{const s=Math.max(0,Math.round(seconds));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');};
