import React, { useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { t, type Locale } from "@/i18n";

const MIN_PASSWORD_LENGTH = 8;

interface Props {
  serverError?: string | null;
  locale: Locale;
}

export default function ResetPasswordForm({ serverError, locale }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!password) {
      next.password = t(locale, "auth.vPwReq");
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = t(locale, "auth.vPwMin");
    }

    if (!confirmPassword) {
      next.confirmPassword = t(locale, "auth.vConfirmReq");
    } else if (password !== confirmPassword) {
      next.confirmPassword = t(locale, "auth.vPwMismatch");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const remaining = MIN_PASSWORD_LENGTH - password.length;
  const passwordHint =
    !errors.password && password.length > 0 && remaining > 0 ? (
      <p className="text-text-faint mt-1.5 text-xs">
        {locale === "pl"
          ? `Jeszcze ${remaining} znaków`
          : `${remaining} more character${remaining !== 1 ? "s" : ""} needed`}
      </p>
    ) : undefined;

  return (
    <form method="POST" action="/api/auth/reset-password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="password"
        label={t(locale, "auth.lNewPw")}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={t(locale, "auth.phMin")}
        error={errors.password}
        hint={passwordHint}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label={t(locale, "auth.lConfirmNew")}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder={t(locale, "auth.phReenterNew")}
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={t(locale, "auth.updatingPw")} icon={<KeyRound className="size-4" />}>
        {t(locale, "auth.updatePw")}
      </SubmitButton>
    </form>
  );
}
