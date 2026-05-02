import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";

/**
 * Map WeatherFlow's `icon` strings (returned by better_forecast for
 * current_conditions, forecast.daily and forecast.hourly) to Lucide
 * glyphs. Unknown values fall through to a generic cloud so the layout
 * never breaks.
 */
const ICONS: Record<string, LucideIcon> = {
  "clear-day": Sun,
  "clear-night": Moon,
  cloudy: Cloud,
  foggy: CloudFog,
  "partly-cloudy-day": CloudSun,
  "partly-cloudy-night": CloudMoon,
  rainy: CloudRain,
  "rain-possible": CloudDrizzle,
  "rain-possible-day": CloudDrizzle,
  "rain-possible-night": CloudDrizzle,
  snow: CloudSnow,
  "snow-possible": Snowflake,
  sleet: CloudSnow,
  "thunderstorms-possible": CloudLightning,
  "thunderstorms-possible-day": CloudLightning,
  "thunderstorms-possible-night": CloudLightning,
  thunderstorms: CloudLightning,
  windy: Wind,
};

export function WeatherIcon({
  icon,
  className,
  ariaLabel,
}: {
  icon: string | undefined | null;
  className?: string;
  ariaLabel?: string;
}) {
  const Glyph: LucideIcon = (icon ? ICONS[icon] : undefined) ?? Cloud;
  return <Glyph className={className} aria-label={ariaLabel} aria-hidden={!ariaLabel} />;
}
