# BeeAtlas Frontend — Спецификация UI (Next.js)

## Обзор

Спецификация описывает структуру UI приложения BeeAtlas на Next.js, состоящего из трёх основных блоков. Все запросы к API проходят через Gateway.

---

## Конфигурация для режима разработки

### Gateway URL
```
http://localhost:8080
```

### Отключение авторизации

Для режима разработки в Gateway добавлены пути в `EXCLUDED_PATHS` (ValidateTokenFilter.java):
- `/api-gateway/product/`
- `/api-gateway/capability/`
- `/api-gateway/techradar/`

**Важно:** После изменения `ValidateTokenFilter.java` необходимо пересобрать и перезапустить Gateway (без кэша):
```bash
cd beeatlas-fdm-infrastructure
docker-compose build --no-cache gateway && docker-compose up -d gateway
```

**Альтернатива (без пересборки):** использовать заголовок `Authorization: Bearer <token>` — в профиле `local` валидация JWT отключена, подойдёт любой валидный JWT.

---

## Структура UI

### 1. Каталог продуктов (Product Catalog)

**Назначение:** Отображение и управление продуктами пользователя.

#### Применимые API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api-gateway/product/v1/user/product` | Список продуктов текущего пользователя |
| GET | `/api-gateway/product/v1/user/product/admin` | Список всех продуктов (для администратора) |

#### Пример запроса
```http
GET http://localhost:8080/api-gateway/product/v1/user/product
```

#### Пример ответа
```json
[]
```
*(массив продуктов; при пустом списке — `[]`)*

---

### 2. Каталог возможностей (Capability Catalog)

**Назначение:** Иерархический каталог бизнес- и технических возможностей.

#### Применимые API

##### Бизнес-возможности (Business Capabilities)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api-gateway/capability/v1/business` | Список корневых бизнес-возможностей |
| GET | `/api-gateway/capability/v1/business/:id` | Детали бизнес-возможности по ID |
| GET | `/api-gateway/capability/v1/business/:id/children` | Дочерние возможности |
| GET | `/api-gateway/capability/v1/business/:id/parents` | Родительские возможности |
| GET | `/api-gateway/capability/v1/business/tree` | Дерево бизнес-возможностей |

##### Технические возможности (Tech Capabilities)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api-gateway/capability/v1/tech` | Список технических возможностей |
| GET | `/api-gateway/capability/v1/tech/:id` | Детали технической возможности |
| GET | `/api-gateway/capability/v1/tech/:id/parents` | Родительские возможности |

##### Поиск и подписки

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api-gateway/capability/v1/search?findBy=CORE&search={text}` | Поиск возможностей |
| GET | `/api-gateway/capability/v1/capabilities-subscribed?entity-type=TECH_CAPABILITY` | Подписанные возможности |

#### Примеры запросов
```http
GET http://localhost:8080/api-gateway/capability/v1/business
GET http://localhost:8080/api-gateway/capability/v1/business/tree
GET http://localhost:8080/api-gateway/capability/v1/tech
GET http://localhost:8080/api-gateway/capability/v1/search?findBy=CORE&search=Управление
```

---

### 3. Технический радар (Tech Radar)

**Назначение:** Визуализация технологий по кольцам (Adopt, Assess, Hold и т.д.) и секторам.

#### Применимые API

##### Технологии

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api-gateway/techradar/v1/tech` | Список всех технологий |
| GET | `/api-gateway/techradar/v1/tech/subscribed` | Подписанные технологии |
| GET | `/api-gateway/techradar/v1/category/tech?id_category={id}` | Технологии по категории |
| POST | `/api-gateway/techradar/v1/tech` | Создание технологии |
| PATCH | `/api-gateway/techradar/v1/tech` | Обновление технологии |
| DELETE | `/api-gateway/techradar/v1/tech/:id` | Удаление технологии |

##### Категории

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api-gateway/techradar/v1/category` | Список категорий |
| POST | `/api-gateway/techradar/v1/category` | Создание категории |
| PATCH | `/api-gateway/techradar/v1/category/:id` | Обновление категории |
| DELETE | `/api-gateway/techradar/v1/category/:id` | Удаление категории |
| PUT | `/api-gateway/techradar/v1/category/join` | Объединение категорий |

##### Версии технологий

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api-gateway/techradar/v1/tech/:id_tech/version` | Добавление версии |
| PATCH | `/api-gateway/techradar/v1/tech/:id_tech/version/:id_version` | Обновление версии |

#### Пример ответа GET /tech
```json
[
  {
    "id": 1,
    "label": "Rocky Linux",
    "review": true,
    "description": "Операционная система",
    "link": "https://bwiki.beeline.ru/x/N-VsFg",
    "ring": { "id": 1, "name": "Adopt", "order": 0 },
    "sector": { "id": 2, "name": "Платформа и инфраструктура", "order": 1 },
    "isCritical": false,
    "category": [],
    "versions": [],
    "history": []
  }
]
```

#### Структура данных Tech Radar
- **ring** — кольцо радара (Adopt, Assess, Hold, Trial)
- **sector** — сектор (Платформа и инфраструктура, Управление данными, Языки и т.д.)
- **category** — дополнительные категории

---

## Сводная таблица API по блокам

| Блок UI | Базовый путь | Основные endpoints |
|---------|--------------|-------------------|
| Каталог продуктов | `/api-gateway/product/v1` | user/product, user/product/admin |
| Каталог возможностей | `/api-gateway/capability/v1` | business, business/tree, tech, search |
| Технический радар | `/api-gateway/techradar/v1` | tech, category, category/tech |

---

## Рекомендации по реализации Next.js

1. **API-клиент:** Создать единый клиент с базовым URL `http://localhost:8080` (или из env).
2. **Режим разработки:** При `NEXT_PUBLIC_DEV_MODE=true` не передавать заголовок Authorization (если Gateway настроен с EXCLUDED_PATHS).
3. **Структура страниц:**
   - `/products` — каталог продуктов
   - `/capabilities` — каталог возможностей (дерево + поиск)
   - `/tech-radar` — технический радар (радар-диаграмма)
4. **Кэширование:** Использовать SWR или React Query для кэширования и ревалидации.
5. **Обработка ошибок:** API возвращает 401 при отсутствии авторизации, 500 при ошибках бэкенда.

---

## Проверка API (статус на 12.03.2026)

| API | Статус |
|-----|--------|
| GET /api-gateway/product/v1/user/product | ✅ 200 |
| GET /api-gateway/capability/v1/business | ✅ 200 |
| GET /api-gateway/capability/v1/business/tree | ✅ 200 |
| GET /api-gateway/capability/v1/tech | ✅ 200 |
| GET /api-gateway/techradar/v1/tech | ✅ 200 |
| GET /api-gateway/techradar/v1/category | ✅ 200 |

*Сервисы запущены через docker-compose. Gateway на порту 8080.*
