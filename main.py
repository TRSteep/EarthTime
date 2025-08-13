# matplotlib cartopy pytz geopy numpy requests
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from datetime import datetime
import pytz
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderUnavailable
import numpy as np
import requests

# Настройка карты
fig = plt.figure(figsize=(12, 10))
ax = fig.add_subplot(1, 1, 1, projection=ccrs.Orthographic(central_longitude=0.0, central_latitude=0.0))
ax.set_global()

# Стилизация Земли
ax.add_feature(cfeature.LAND, facecolor='#7c9d8d')
ax.add_feature(cfeature.OCEAN, facecolor='#2a4a6b')
ax.add_feature(cfeature.COASTLINE, edgecolor='#5d5d5d', linewidth=0.5)
ax.add_feature(cfeature.BORDERS, linestyle='-', edgecolor='#5d5d5d', alpha=0.5, linewidth=0.3)
ax.gridlines(color='gray', linestyle='--', alpha=0.3)

# Список столиц с предопределенными часовыми поясами
capitals = [
    {'city': 'Токио', 'lat': 35.6897, 'lon': 139.6922, 'tz': 'Asia/Tokyo'},
    {'city': 'Дели', 'lat': 28.6139, 'lon': 77.2090, 'tz': 'Asia/Kolkata'},
    {'city': 'Пекин', 'lat': 39.9042, 'lon': 116.4074, 'tz': 'Asia/Shanghai'},
    {'city': 'Москва', 'lat': 55.7558, 'lon': 37.6173, 'tz': 'Europe/Moscow'},
    {'city': 'Лондон', 'lat': 51.5074, 'lon': -0.1278, 'tz': 'Europe/London'},
    {'city': 'Берлин', 'lat': 52.5200, 'lon': 13.4050, 'tz': 'Europe/Berlin'},
    {'city': 'Каир', 'lat': 30.0444, 'lon': 31.2358, 'tz': 'Africa/Cairo'},
    {'city': 'Найроби', 'lat': -1.2864, 'lon': 36.8172, 'tz': 'Africa/Nairobi'},
    {'city': 'Нью-Йорк', 'lat': 40.7128, 'lon': -74.0060, 'tz': 'America/New_York'},
    {'city': 'Сан-Паулу', 'lat': -23.5505, 'lon': -46.6333, 'tz': 'America/Sao_Paulo'}
]


# Функция для определения времени по часовому поясу
def get_local_time(tz_name):
    try:
        tz = pytz.timezone(tz_name)
        return datetime.now(tz).strftime('%H:%M')
    except pytz.UnknownTimeZoneError:
        return datetime.utcnow().strftime('%H:%M') + ' (UTC)'


# Создание эффекта объемного шара
theta = np.linspace(0, 2 * np.pi, 100)
radius = 90
circle_x = radius * np.sin(theta)
circle_y = radius * np.cos(theta)
ax.plot(circle_x, circle_y, color='black', alpha=0.2, linewidth=4, transform=ccrs.Geodetic())

# Отображение столиц
for capital in capitals:
    city = capital['city']
    lat = capital['lat']
    lon = capital['lon']
    tz = capital['tz']

    # Получение текущего времени
    local_time = get_local_time(tz)

    # Отображение точки столицы
    ax.plot(lon, lat, 'o',
            markersize=8,
            color='#ff6b6b',
            alpha=0.9,
            transform=ccrs.Geodetic())

    # Создание аннотации
    text = f"{city}\n{local_time}"
    ax.annotate(text,
                xy=(lon, lat),
                xytext=(10, 10),
                textcoords='offset points',
                color='white',
                fontsize=9,
                weight='bold',
                bbox=dict(boxstyle="round,pad=0.3", fc='#2c3e50', alpha=0.9),
                transform=ccrs.Geodetic())

# Добавление декоративных элементов
plt.title('Земля с текущим временем в столицах', fontsize=18, pad=20, color='#2c3e50')
plt.figtext(0.5, 0.05, f"Время UTC: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            ha='center', fontsize=12, color='#2c3e50')

# Сохранение и отображение
plt.tight_layout()
plt.savefig('earth_with_time.png', dpi=300, bbox_inches='tight')
plt.show()