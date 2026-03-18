import Link from "next/link";

export default function HomePage() {
  return (
    <div className="w-full">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Добро пожаловать в BeeAtlas Lite
      </h1>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        Платформа управления продуктами, возможностями, технологическим радаром и архитектурой.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/products"
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span className="mb-2 block text-2xl">📦</span>
          <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">
            Каталог продуктов
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Управление продуктами пользователя
          </p>
        </Link>
        <Link
          href="/capabilities"
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span className="mb-2 block text-2xl">🔧</span>
          <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">
            Каталог возможностей
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Бизнес- и технические возможности
          </p>
        </Link>
        <Link
          href="/tech-radar"
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span className="mb-2 block text-2xl">📡</span>
          <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">
            Технический радар
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Визуализация технологий по кольцам и секторам
          </p>
        </Link>
        <Link
          href="/architecture"
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span className="mb-2 block text-2xl">🏗</span>
          <h2 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">
            Архитектура
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Работа с архитектурным графом, загрузка workspace
          </p>
        </Link>
      </div>
    </div>
  );
}
