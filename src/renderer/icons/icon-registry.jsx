import React from "react";
import claudeIcon from "../assets/provider-icons/claude.png";
import codexIcon from "../assets/provider-icons/codex.png";
import geminiIcon from "../assets/provider-icons/gemini.png";

function mergeClassName(...classes) {
  return classes.filter(Boolean).join(" ");
}

const PROVIDER_META = {
  claude: { title: "Claude Code", icon: claudeIcon },
  codex: { title: "Codex CLI", icon: codexIcon },
  gemini: { title: "Gemini CLI", icon: geminiIcon }
};

export function ProviderIcon({
  provider = "claude",
  className = "",
  variant = "default",
  size = 14,
  ...rest
}) {
  const key = PROVIDER_META[provider] ? provider : "claude";
  const style = { width: size, height: size };
  const imageStyle = variant === "muted"
    ? { filter: "grayscale(1) saturate(0.15) brightness(1.1)", opacity: 0.88 }
    : undefined;
  const mergedStyle = imageStyle ? { ...style, ...imageStyle } : style;
  const providerClassName = `provider-icon-${key}`;

  return (
    <img
      src={PROVIDER_META[key].icon}
      alt=""
      aria-hidden="true"
      draggable="false"
      className={mergeClassName("icon provider-icon", providerClassName, className)}
      style={mergedStyle}
      title={PROVIDER_META[key].title}
      role="presentation"
      loading="lazy"
      decoding="async"
      {...rest}
    />
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

export function SkillExtractIcon({ className = "", size = 14 }) {
  return (
    <svg
      className={mergeClassName("icon skill-extract-icon", className)}
      style={{ width: size, height: size }}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M8.2 1.8L8.85 3.65L10.7 4.3L8.85 4.95L8.2 6.8L7.55 4.95L5.7 4.3L7.55 3.65L8.2 1.8Z"
        fill="currentColor"
      />
      <path
        d="M4.35 7.2L4.85 8.65L6.3 9.15L4.85 9.65L4.35 11.1L3.85 9.65L2.4 9.15L3.85 8.65L4.35 7.2Z"
        fill="currentColor"
      />
      <path
        d="M10.1 7.1L10.95 8.05C11.35 8.49 11.97 8.65 12.53 8.45L13.1 8.24L12.89 8.81C12.69 9.37 12.85 9.99 13.29 10.39L14.24 11.24L13.03 11.43C12.46 11.52 11.98 11.91 11.76 12.44L11.3 13.55L10.84 12.44C10.62 11.91 10.14 11.52 9.57 11.43L8.36 11.24L9.31 10.39C9.75 9.99 9.91 9.37 9.71 8.81L9.5 8.24L10.07 8.45C10.63 8.65 11.25 8.49 11.65 8.05L12.5 7.1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
