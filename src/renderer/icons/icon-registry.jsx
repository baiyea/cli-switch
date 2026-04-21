import React from "react";

function mergeClassName(...classes) {
  return classes.filter(Boolean).join(" ");
}

const PROVIDER_META = {
  claude: { title: "Claude Code", color: "#d57a58" },
  codex: { title: "Codex CLI", color: "#5f7cf3" },
  gemini: { title: "Gemini CLI", color: "#6d86ea" }
};

export function ProviderIcon({
  provider = "claude",
  className = "",
  variant = "default",
  size = 14,
  ...rest
}) {
  const key = PROVIDER_META[provider] ? provider : "claude";
  const color = variant === "muted" ? "#a8b4c1" : PROVIDER_META[key].color;
  const stroke = variant === "muted" ? 1.35 : 1.6;
  const style = { width: size, height: size, color };

  if (key === "codex") {
    return (
      <svg
        className={mergeClassName("icon provider-icon provider-icon-codex", className)}
        style={style}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        {...rest}
      >
        <path d="M4.5 3.5L8.5 8L4.5 12.5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 12.3H13" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "gemini") {
    return (
      <svg
        className={mergeClassName("icon provider-icon provider-icon-gemini", className)}
        style={style}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        {...rest}
      >
        <path d="M8 2.7L9.5 6.5L13.3 8L9.5 9.5L8 13.3L6.5 9.5L2.7 8L6.5 6.5L8 2.7Z" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg
      className={mergeClassName("icon provider-icon provider-icon-claude", className)}
      style={style}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      <path d="M8 2.2L9.35 5.1L12.5 5.5L10.2 7.65L10.8 10.8L8 9.25L5.2 10.8L5.8 7.65L3.5 5.5L6.65 5.1L8 2.2Z" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
    </svg>
  );
}

export function ArchiveIcon({ className = "", size = 12 }) {
  return (
    <svg
      className={mergeClassName("icon archive-icon", className)}
      style={{ width: size, height: size }}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 6.5V12.5C3.5 13.05 3.95 13.5 4.5 13.5H11.5C12.05 13.5 12.5 13.05 12.5 12.5V6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 9H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ExplorerToggleIcon({ className = "", size = 16 }) {
  return (
    <svg
      className={mergeClassName("icon explorer-toggle-icon", className)}
      style={{ width: size, height: size }}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.75" y="2" width="12.5" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 2.7V13.3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function SettingsIcon({ className = "", size = 14 }) {
  return (
    <svg
      className={mergeClassName("icon settings-icon", className)}
      style={{ width: size, height: size }}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6.55 2.15C6.74 1.45 7.73 1.45 7.92 2.15L8.15 3C8.92 3.16 9.63 3.46 10.25 3.88L10.99 3.48C11.63 3.13 12.32 3.82 11.97 4.46L11.57 5.2C11.99 5.82 12.29 6.53 12.45 7.3L13.3 7.53C14 7.72 14 8.71 13.3 8.9L12.45 9.13C12.29 9.9 11.99 10.61 11.57 11.23L11.97 11.97C12.32 12.61 11.63 13.3 10.99 12.95L10.25 12.55C9.63 12.97 8.92 13.27 8.15 13.43L7.92 14.28C7.73 14.98 6.74 14.98 6.55 14.28L6.32 13.43C5.55 13.27 4.84 12.97 4.22 12.55L3.48 12.95C2.84 13.3 2.15 12.61 2.5 11.97L2.9 11.23C2.48 10.61 2.18 9.9 2.02 9.13L1.17 8.9C0.47 8.71 0.47 7.72 1.17 7.53L2.02 7.3C2.18 6.53 2.48 5.82 2.9 5.2L2.5 4.46C2.15 3.82 2.84 3.13 3.48 3.48L4.22 3.88C4.84 3.46 5.55 3.16 6.32 3L6.55 2.15Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="7.24" cy="8.22" r="2.05" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
