import { colors, spacing } from "./tokens";

interface LoginFormProps {
  error?: string;
  loading?: boolean;
  onSubmit: (email: string, password: string) => void;
}

/** fixture: 토큰만 사용하는 예시 컴포넌트 */
export function LoginForm({ error, loading }: LoginFormProps) {
  return {
    kind: "form",
    style: { padding: spacing.md, background: colors.surface },
    children: [
      error
        ? { kind: "alert", color: colors.danger, text: `다시 시도해 주세요. ${error}` }
        : null,
      { kind: "button", disabled: Boolean(loading), text: loading ? "로그인 중" : "로그인" },
    ],
  };
}
