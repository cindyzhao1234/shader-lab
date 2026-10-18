import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Tooltip, type TooltipSide } from "./Tooltip";

/**
 * Buttons.
 *
 * `unavailable` is for features that are planned but not built yet. The
 * button stays focusable and hoverable so the reason can be read, looks
 * clearly inert, and swallows clicks. Using the native `disabled` attribute
 * would hide the explanation from keyboard and pointer users alike.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface BaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Why this cannot be used yet. Shown as a tooltip and read by screen readers. */
  unavailable?: string;
}

interface ButtonProps extends BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  children: ReactNode;
  tooltip?: ReactNode;
  shortcut?: readonly string[];
}

function guard(unavailable: string | undefined, onClick: ButtonProps["onClick"]) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    if (unavailable) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  };
}

function classes(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  unavailable,
  tooltip,
  shortcut,
  className,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  const button = (
    <button
      type={type}
      className={classes("button", `button--${variant}`, `button--${size}`, unavailable && "is-unavailable", className)}
      aria-disabled={unavailable ? true : rest["aria-disabled"]}
      aria-description={unavailable}
      onClick={guard(unavailable, onClick)}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      <span className="button__label">{children}</span>
      {unavailable && (
        <span className="button__soon" aria-hidden="true">
          Soon
        </span>
      )}
    </button>
  );

  const tip = unavailable ?? tooltip;
  return tip ? (
    <Tooltip content={tip} shortcut={unavailable ? undefined : shortcut}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

interface IconButtonProps extends BaseProps {
  icon: IconName;
  /** Accessible name, also shown as the tooltip. */
  label: string;
  shortcut?: readonly string[];
  /** For toggles: rendered pressed and announced via aria-pressed. */
  pressed?: boolean;
  size?: ButtonSize;
  tone?: "default" | "onDark";
  tooltipSide?: TooltipSide;
}

export function IconButton({
  icon,
  label,
  shortcut,
  pressed,
  size = "md",
  tone = "default",
  unavailable,
  tooltipSide,
  className,
  onClick,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={unavailable ? `${label} — ${unavailable}` : label} shortcut={unavailable ? undefined : shortcut} side={tooltipSide}>
      <button
        type={type}
        className={classes(
          "icon-button",
          `icon-button--${size}`,
          tone === "onDark" && "icon-button--on-dark",
          pressed && "is-pressed",
          unavailable && "is-unavailable",
          className,
        )}
        aria-label={label}
        aria-pressed={pressed}
        aria-disabled={unavailable ? true : undefined}
        aria-description={unavailable}
        onClick={guard(unavailable, onClick)}
        {...rest}
      >
        <Icon name={icon} size={size === "sm" ? 15 : size === "lg" ? 20 : 17} />
      </button>
    </Tooltip>
  );
}
