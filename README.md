# BeeAtlas Lite

Pet-проект с vibe-code UI для приложения **BeeAtlas** (BeeTech) — упрощённый фронтенд для проверки работы с REST API бэкенда BeeAtlas.

## О проекте

BeeAtlas Lite — это Next.js приложение, которое подключается к API Gateway BeeAtlas и позволяет:

- управлять продуктами, возможностями и технологическим радаром;
- загружать архитектурные workspace (Structurizr JSON) в локальный и глобальный граф;
- строить контекстные диаграммы и выполнять CYPHER-запросы к Neo4j;
- загружать `workspace.dsl` (Structurizr DSL) в FDM: импорт контейнеров, проверки архитектуры (fitness functions) и технических возможностей;
- просматривать результаты проверок архитектуры (последняя оценка по продукту);
- просматривать технические возможности продукта из контейнеров и интерфейсов.

## Структура сервисов (docker-compose)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         beeatlas-frontend (Next.js)                     │
│                              порт 3000                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         gateway (API Gateway)                           │
│                         порты 8080, 8090, 10260                         │
└─────────────────────────────────────────────────────────────────────────┘
         │              │              │              │              │
         ▼              ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ fdm-auth     │ │ capability   │ │ products     │ │ techradar    │ │ architect-   │
│ -backend     │ │ -backend     │ │ -service     │ │ -backend     │ │ graph-service│
│ 8081         │ │ 8082         │ │ 8084         │ │ 8085         │ │ 8083         │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
         │              │              │              │              │
         └──────────────┴──────────────┴──────────────┴──────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│ postgres     │              │ neo4j        │              │ rabbitmq     │
│ 5433         │              │ 7474, 7687   │              │ 5672, 15672  │
└──────────────┘              └──────────────┘              └──────────────┘

┌────────────────────────┐  ┌──────────────────────┐
│ structurizr-onpremises │  │ structurizr_backend  │
│ 8087                   │  │ 8086                 │
└────────────────────────┘  └──────────────────────┘
```

| Сервис | Порт | Описание |
|--------|------|----------|
| **beeatlas-frontend** | 3000 | Next.js UI |
| **gateway** | 8080 | API Gateway (маршрутизация на бэкенды) |
| **fdm-auth-backend** | 8081 | Аутентификация |
| **capability-backend** | 8082 | Бизнес- и технические возможности |
| **architect-graph-service** | 8083 | Архитектурный граф (Neo4j) |
| **products-service** | 8084 | Продукты |
| **techradar-backend** | 8085 | Технологический радар |
| **structurizr_backend** | 8086 | Интеграция с Structurizr |
| **structurizr-onpremises** | 8087 | Structurizr OnPremises (опенсорс) |
| **postgres** | 5433 | PostgreSQL |
| **neo4j** | 7474, 7687 | Neo4j Browser и Bolt |
| **rabbitmq** | 5672, 15672 | RabbitMQ и Management UI |

## Запуск через docker-compose

### Требования

- Docker и Docker Compose
- Git submodule `beeatlas-fdm-infrastructure` (инициализирован и обновлён)

### Инициализация submodule

```bash
git submodule update --init --recursive
```

### Запуск

```bash
docker compose up -d
```

Приложение будет доступно по адресу: **http://localhost:3000**

API Gateway: **http://localhost:8080**

### Остановка

```bash
docker compose down
```

### Только frontend (без бэкендов)

```bash
npm install
npm run dev
```

В этом режиме нужен работающий Gateway по адресу `NEXT_PUBLIC_API_URL` (по умолчанию `http://localhost:8080`).

## Настраиваемые переменные

### Frontend (beeatlas-frontend)

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `API_URL` | URL Gateway для серверных запросов (из контейнера) | `http://gateway:8080` |
| `NEXT_PUBLIC_API_URL` | URL Gateway для браузера | `http://localhost:8080` |
| `BEEATLAS_FRONTEND_PORT` | Порт frontend на хосте | `3000` |

### Другие сервисы

| Переменная | Сервис | Описание |
|------------|--------|----------|
| `FDM_AUTH_SERVICE_PORT` | fdm-auth-backend | Порт (по умолчанию 8081) |
| `CAPABILITY_SERVICE_PORT` | capability-backend | Порт (по умолчанию 8082) |
| `AUTHENTIC_AUTH` | redis, authentik-* | Профиль для Authentik (`true`/`false`) |
| `RABBITMQ_EXCHANGE` | architect-graph-service | Exchange RabbitMQ |
| `RABBITMQ_ROUTING_KEY` | architect-graph-service | Routing key RabbitMQ |

### structurizr_backend

| Переменная | Описание |
|------------|----------|
| `URL_ONPREMISES_WORKSPACE` | URL API workspace Structurizr OnPremises |
| `URL_ONPREMISES_BASE` | Базовый URL API Structurizr |
| `URL_DOCUMENTS` | URL сервиса документов |
| `URL_TECHRADAR` | URL TechRadar backend |
| `URL_PRODUCTS` | URL Products service |
| `URL_VEGA` | URL Vega (внешний сервис) |
| `ONPREMISES_PASSWORD` | Пароль для Structurizr OnPremises |

## Структура страниц и REST API

### Страницы

| Маршрут | Описание |
|---------|----------|
| `/` | Главная — навигация по разделам |
| `/products` | Каталог продуктов (CRUD, фильтр, сортировка) |
| `/products/[alias]` | Карточка продукта с вкладками: **Информация** (редактирование, Structurizr, загрузка `workspace.dsl`), **Технологии**, **Пользователи**, **Контейнеры**, **Проверки архитектуры** (fitness, HTML-результаты), **Context** (диаграммы), **Технические возможности** (из контейнеров/интерфейсов) |
| `/capabilities` | Каталог возможностей: дерево бизнес/техвозможностей, поиск, детали |
| `/tech-radar` | Технологический радар: визуализация по кольцам и секторам |
| `/tech-radar/edit` | Редактирование технологий: CRUD, версии, статусы |
| `/architecture` | Архитектура: загрузка JSON, контекстные диаграммы, CYPHER-запросы |

### REST API (через Gateway)

Все запросы идут на `NEXT_PUBLIC_API_URL` (Gateway). Gateway проксирует на соответствующие бэкенды.

#### Products (`/api-gateway/product/v1`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/user/product` | Список продуктов пользователя |
| GET | `/user/product/admin` | Список продуктов (админ) |
| GET | `/product/{alias}` | Продукт по alias |
| PUT | `/product` | Обновление продукта |
| PATCH | `/product/{alias}/workspace` | Обновление Structurizr (URL, Key, Secret, Workspace) |
| DELETE | `/product/{alias}` | Удаление продукта |
| GET | `/product/{alias}/employee` | Пользователи продукта |
| GET | `/product/{alias}/container` | Контейнеры с интерфейсами и операциями (включая TC) |
| GET | `/product/{alias}/fitness-function` | Результаты проверок архитектуры (последняя оценка; опционально `source_type`, `source_id`). Поле `resultDetails` — HTML |
| GET | `/product/implemented/container/tech-capability` | Техвозможности по контейнерам |

#### Structurizr Backend (`/structurizr-backend`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/workspace` | Создание workspace в On-Premises и обновление продукта (тело: `{ code, architect_name }`; может занимать минуты) |
| POST | `/api/v1/dsl2fdm` | Импорт `workspace.dsl` в FDM: проверки, контейнеры, TC (тело: `{ productAlias, workspace: base64 }`) |

#### Capabilities (`/api-gateway/capability/v1`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/business/tree` | Дерево бизнес-возможностей |
| GET | `/business/{id}` | Бизнес-возможность по ID |
| GET | `/business/{id}/children` | Дочерние возможности |
| GET | `/tech/{id}` | Техвозможность по ID |
| GET | `/search?findBy=&search=` | Поиск возможностей |

#### TechRadar (`/api-gateway/techradar/v1`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/tech?actualTech=` | Список технологий |
| GET | `/tech/{id}` | Технология по ID |
| POST | `/tech` | Создание технологии |
| PATCH | `/tech/{id}` | Обновление технологии |
| DELETE | `/tech/{id}` | Удаление технологии |
| GET | `/rings` | Кольца радара |
| GET | `/sectors` | Секторы |
| GET | `/category` | Категории |
| GET | `/category/tech?id_category=` | Технологии по категориям |
| POST | `/tech/{id}/version` | Добавление версии |
| PATCH | `/tech/{id}/version/{vid}` | Обновление версии |
| DELETE | `/tech/{id}/version/{vid}` | Удаление версии |

#### Architect Graph (через Next.js API routes → Gateway)

Next.js проксирует запросы к `architect-graph-service` для обхода CORS:

| Next.js API | Бэкенд | Описание |
|-------------|--------|----------|
| POST `/api/graph/local` | POST `/arch-graph/api/v1/graph/local/json` | Загрузка в локальный граф |
| POST `/api/graph/global` | POST `/arch-graph/api/v1/graph/json` | Загрузка в глобальный граф |
| GET `/api/graph/context?mnemonic=` | GET `/arch-graph/api/v1/context/{mnemonic}` | Контекстная диаграмма (JSON) |
| GET `/api/graph/context-dot?cmdb=` | GET `/arch-graph/api/v1/context/dot?cmdb=` | DOT входящих связей |
| GET `/api/graph/context-influence-dot?cmdb=` | GET `/arch-graph/api/v1/context/influence/dot?cmdb=` | DOT исходящих связей |
| POST `/api/graph/cypher` | GET `/arch-graph/api/v1/elements` (заголовок CYPHER-QUERY) | Выполнение CYPHER-запроса |

## Стек

- **Next.js 16** (App Router)
- **React 19**
- **Tailwind CSS 4**
- **@hpcc-js/wasm** — рендеринг DOT-диаграмм
- **react-force-graph-2d** — визуализация графов

## Лицензия

Apache License 2.0 — см. [LICENSE](LICENSE).
