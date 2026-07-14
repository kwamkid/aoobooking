import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const t = await getTranslations("app");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">{t("name")}</h1>
        <p className="mt-1 text-neutral-500">{t("tagline")}</p>
      </div>
      <LoginForm />
    </main>
  );
}
