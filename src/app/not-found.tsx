import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="mb-4 text-4xl font-bold text-zinc-900 dark:text-zinc-100">
        404
      </h1>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        Страница не найдена
      </p>
      <Link
        href="/"
        className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600"
      >
        На главную
      </Link>
    </div>
  );
}
