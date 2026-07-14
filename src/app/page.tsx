import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui";

export default async function Home() {
  const t = await getTranslations("app");
  const tAuth = await getTranslations("auth");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-6">
      <div className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aoobooking-logo.svg" alt="" className="mb-4 h-20 w-20" />
        <h1 className="text-4xl font-bold tracking-tight text-brand">{t("name")}</h1>
        <p className="mt-2 text-lg text-fg-muted">{t("tagline")}</p>
      </div>
      <ButtonLink href="/login" size="lg">
        {tAuth("login")}
      </ButtonLink>
    </main>
  );
}
