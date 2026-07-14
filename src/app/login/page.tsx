import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const t = await getTranslations("app");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg p-6">
      <div className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aoobooking-logo.svg" alt="" className="mb-3 h-16 w-16" />
        <h1 className="text-3xl font-bold text-brand">{t("name")}</h1>
        <p className="mt-1 text-fg-muted">{t("tagline")}</p>
      </div>
      <LoginForm />
    </main>
  );
}
