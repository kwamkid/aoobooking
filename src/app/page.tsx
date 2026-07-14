import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function Home() {
  const t = await getTranslations("app");
  const tAuth = await getTranslations("auth");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t("name")}</h1>
        <p className="mt-2 text-lg text-neutral-500">{t("tagline")}</p>
      </div>
      <Link
        href="/login"
        className="rounded-lg bg-neutral-900 px-6 py-3 font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {tAuth("login")}
      </Link>
    </main>
  );
}
