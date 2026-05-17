import type { WeatherInfo } from "@/lib/interactive/types"

type CityPreset = {
  name: string
  country: string
  latitude: number
  longitude: number
}

const CITY_PRESETS: Record<string, CityPreset> = {
  서울: { name: "서울", country: "대한민국", latitude: 37.5665, longitude: 126.978 },
  부산: { name: "부산", country: "대한민국", latitude: 35.1796, longitude: 129.0756 },
  대구: { name: "대구", country: "대한민국", latitude: 35.8714, longitude: 128.6014 },
  인천: { name: "인천", country: "대한민국", latitude: 37.4563, longitude: 126.7052 },
  광주: { name: "광주", country: "대한민국", latitude: 35.1595, longitude: 126.8526 },
  대전: { name: "대전", country: "대한민국", latitude: 36.3504, longitude: 127.3845 },
  울산: { name: "울산", country: "대한민국", latitude: 35.5384, longitude: 129.3114 },
  제주: { name: "제주", country: "대한민국", latitude: 33.4996, longitude: 126.5312 },
  도쿄: { name: "도쿄", country: "일본", latitude: 35.6762, longitude: 139.6503 },
  오사카: { name: "오사카", country: "일본", latitude: 34.6937, longitude: 135.5023 },
  뉴욕: { name: "뉴욕", country: "미국", latitude: 40.7128, longitude: -74.006 },
  런던: { name: "런던", country: "영국", latitude: 51.5072, longitude: -0.1276 },
}

type OpenMeteoCurrent = {
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    weather_code?: number
    wind_speed_10m?: number
  }
}

type OpenMeteoGeo = {
  results?: Array<{
    name: string
    country?: string
    latitude: number
    longitude: number
  }>
}

export async function getWeatherInfo(cityName = "서울"): Promise<WeatherInfo> {
  const city = await resolveCity(cityName)
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.searchParams.set("latitude", String(city.latitude))
    url.searchParams.set("longitude", String(city.longitude))
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m")
    url.searchParams.set("timezone", "auto")

    const response = await fetch(url.toString(), { cache: "no-store" })
    if (!response.ok) throw new Error(`weather status ${response.status}`)
    const data = (await response.json()) as OpenMeteoCurrent
    const current = data.current
    if (!current || current.temperature_2m === undefined) throw new Error("missing current weather")

    return {
      city: city.name,
      country: city.country,
      temperature: Math.round(current.temperature_2m),
      feelsLike: current.apparent_temperature !== undefined ? Math.round(current.apparent_temperature) : undefined,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      weatherCode: current.weather_code,
      condition: getKoreanCondition(current.weather_code),
      isMock: false,
      updatedAt: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    }
  } catch {
    return createMockWeather(city)
  }
}

async function resolveCity(cityName: string): Promise<CityPreset> {
  const preset = CITY_PRESETS[cityName]
  if (preset) return preset

  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
    url.searchParams.set("name", cityName)
    url.searchParams.set("count", "1")
    url.searchParams.set("language", "ko")
    url.searchParams.set("format", "json")

    const response = await fetch(url.toString(), { cache: "no-store" })
    if (!response.ok) throw new Error(`geo status ${response.status}`)
    const data = (await response.json()) as OpenMeteoGeo
    const first = data.results?.[0]
    if (!first) return CITY_PRESETS.서울

    return {
      name: first.name,
      country: first.country ?? "",
      latitude: first.latitude,
      longitude: first.longitude,
    }
  } catch {
    return CITY_PRESETS.서울
  }
}

function createMockWeather(city: CityPreset): WeatherInfo {
  const seed = city.name.charCodeAt(0) + city.name.length * 7
  const temperature = 16 + (seed % 12)

  return {
    city: city.name,
    country: city.country,
    temperature,
    feelsLike: temperature - 1,
    humidity: 45 + (seed % 35),
    windSpeed: 2 + (seed % 6),
    weatherCode: 1,
    condition: "대체로 맑음",
    isMock: true,
    updatedAt: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
  }
}

function getKoreanCondition(code = 0) {
  if (code === 0) return "맑음"
  if ([1, 2, 3].includes(code)) return "구름 조금"
  if ([45, 48].includes(code)) return "안개"
  if ([51, 53, 55, 56, 57].includes(code)) return "이슬비"
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "비"
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈"
  if ([95, 96, 99].includes(code)) return "뇌우"
  return "변화 있음"
}
