Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.

# EcoPoint

Учебное приложение с четырьмя ролями, общим API и серверной базой данных.
Коллектор обслуживает все семь станций. Менеджер — станции ES-1–ES-3.

**Пошаговый запуск и публикация описаны в [START_HERE_RU.txt](START_HERE_RU.txt).**

## Возможности

Сдача отходов с имитацией подсчёта предметов и взвешивания, тарифы за грамм,
начисление баллов, история, скачиваемые чеки, отзывы, жалобы и ответы администратора,
вывоз отходов, акции, статистика и управление учебными аккаунтами.
Интерфейс на русском, казахском и английском. Общие данные обновляются раз в пять секунд
с учётом незавершённых форм.

## Технологии и хранение

Frontend — HTML/CSS/JavaScript. Backend — JavaScript и Netlify Function.
В Netlify используется PostgreSQL через @netlify/database.
Локально — Node.js 24 и SQLite с файлом .data/ecopoint.sqlite.

Данные хранятся в таблице ecopoint_state как версионированное JSON-состояние.
Условное SQL-обновление предотвращает потерю конкурентных изменений.
Состав состояния — пользователи, сессии, станции, сдачи, журнал баллов, чеки,
вывозы, акции, обращения, оценки, заявки на удаление, выплаты и аудит.
Это модель хранения учебной демонстрации. ERD должна отражать эту реализацию
либо отдельно описывать логические сущности.

## Локальный запуск

Установите Node.js 24 или новее. В папке проекта выполните:

```sh
npm ci
npm run setup
npm run build
npm run dev
```

Откройте http://localhost:5173. Setup генерирует пароль в локальном .env.
Последующие запуски — npm run dev.
Сервер слушает 127.0.0.1.

## Учебные аккаунты

| Роль | Логин |
|---|---|
| Житель | resident@example.test |
| Второй житель | resident2@example.test |
| Коллектор | collector@example.test |
| Менеджер | manager@example.test |
| Администратор | admin@example.test |

Локальный пароль находится в .env.
На Netlify начальный пароль задаётся владельцем в секретной переменной
EP_BOOTSTRAP_PASSWORD (16–128 символов).
Преподавателю пароль передаётся лично.
Переменная применяется при создании новой базы, затем пароли хранятся в виде
солёных PBKDF2-SHA256-хешей. Смена переменной не меняет существующие пароли.
Житель меняет собственный пароль в настройках после ввода текущего.
Смена пароля отзывает остальные сессии этого аккаунта.
Сессии используют HttpOnly-cookie, SameSite=Strict и Secure на HTTPS.
Сервер проверяет роли, доступ к объектам и срок действия сессии.

## Netlify

Подключите репозиторий через Import an existing project.
Build command — npm run build. Publish directory — public.
Functions directory — netlify/functions. Base directory — пусто.
Версия Node — 24. Настройки находятся в netlify.toml.
В Environment variables задайте EP_BOOTSTRAP_PASSWORD в области Functions.
Миграция netlify/database/migrations/0001_ecopoint.sql создаёт таблицу PostgreSQL.
Проверьте создание базы в Data & Storage → Database.
Netlify Database использует кредиты credit-based plans.
По условиям курса используйте бесплатный вариант без банковской карты
и ограничьте доступ к размещённому прототипу.
Пошаговые действия и бесплатный локальный запуск — в START_HERE_RU.txt.

Новое размещение использует свою базу. Данные других сайтов и автономных
HTML-файлов автоматически в неё не переносятся.

## Проверка

```sh
npm test
npm run build
npm run check
```

Серверные проверки выполняются на SQLite и на PostgreSQL-движке PGlite
через обработчик Netlify. Включены независимые сессии, разделение ролей,
общие жалобы и заполненность, повторы, конкурентные запросы и сохранение данных.
test-results.json и test-results-postgres.json содержат результаты.

Отдельная проверка интерфейса в JSDOM использует пять независимых сессий
для четырёх ролей. Это программная проверка интерфейса.
Настоящие браузеры, камера телефона, реальная инфраструктура Netlify и внешние
сервисы после публикации проверяются отдельно.

## Implemented requirements


| ID | The system shall… | Endterm | Test |
|---|---|---|---|
| FR-01 | authenticate fictional accounts using a salted password hash | F01 | AT-01 |
| FR-02 | enforce role permissions, session expiry and logout on the server | F01 | AT-01,16,19 |
| FR-03 | expose shared station capabilities and refuse a full station | F02 | AT-02,18 |
| FR-04 | validate a station QR reference and issue a five-minute session | F04 | AT-02,17 |
| FR-05 | require explicit submission; cancellation shall not credit points | F04 | AT-02,17 |
| FR-06 | return the same account balance/history on another device | F05 | AT-03 |
| FR-07 | restrict resident records to their owner | F05 | AT-03 |
| FR-08 | commit at most one credit per event and reject conflicting idempotency payloads | F08 | AT-04 |
| FR-09 | retain incomplete evidence without a credit or strike and reconcile it | F08 | AT-05 |
| FR-10 | allow only an administrator to approve or reject disputed evidence | F14 | AT-06 |
| FR-11 | record an evidence decision with actor, reason and timestamp | F14 | AT-06 |
| FR-12 | atomically debit a reward and issue its unique demonstration reference | F06 | AT-07 |
| FR-13 | require matching station QR and collector scope for servicing | F09 | AT-08 |
| FR-14 | record one visit per visit ID and publish its fill update to other devices | F09 | AT-08 |
| FR-15 | apply a shared campaign to eligible new sessions only, at most ×2 | F11 | AT-09 |
| FR-16 | expose aggregate statistics only for a manager's assigned stations | F10 | AT-09 |
| FR-17 | store a resident's complaint in a shared administrative queue | supporting | AT-10 |
| FR-18 | deliver administrator replies to the complaint's owner | supporting | AT-10 |
| FR-19 | reserve simulated payout points and retain, complete or release the reservation | F07 | AT-11 |
| FR-20 | save a fictional profile on the server | F15 | AT-12 |
| FR-21 | track an account deletion request without claiming immediate erasure | F16 | AT-12 |
| FR-22 | allow administrators to create, block and deactivate accounts | F13 | AT-13 |
| FR-23 | revoke sessions when access or role changes | F13 | AT-13 |
| FR-24 | retain committed data after a server restart | IF-01 | AT-14 |
| FR-25 | retain an administrator-only audit trail excluding authentication secrets | COM-08 | AT-15 |


## API

GET /api/health — проверка соединения с базой.
POST /api/login — вход.
POST /api/logout — выход.
GET /api/state — разрешённые текущему аккаунту данные.
POST /api/action — бизнес-операции с серверной валидацией.

Сервер определяет количество и вес в учебном симуляторе.
Пользователь не вводит баллы или измерения.
Реальное оборудование и денежные переводы имитируются.

## Секреты и данные

.env и .data включены в .gitignore. В GitHub загружайте только исходники.
.env.example содержит пустые шаблоны. Действующих паролей, ключей,
содержимого баз и привязки к чужому хостингу в архиве нет.
Используйте только вымышленные имена и тестовые данные.

## Демовидео

Ссылка на университетский OneDrive добавляется командой после записи.

## Credits and AI disclosure

Сохранён исходный интерфейс EcoPoint команды проекта.
QR generation — Kazuhiko Arase qrcode-generator, MIT.
QR decoding — jsQR, Apache-2.0.
Map — Leaflet 1.9.4, BSD-2-Clause, атрибуция карт показана в интерфейсе.
Font — Unbounded, SIL Open Font License.
Исходные лицензионные уведомления библиотек сохранены.

Разработка и исправления кода выполнялись с помощью ChatGPT / Codex.
Команда должна указать использованные в своей работе модели в AI Disclosure,
проверить код и уметь объяснить его на защите.
