import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon, type IconName } from "../ui/Icon";
import { LogoMark, Wordmark } from "./LogoMark";

interface WelcomeDialogProps {
  open: boolean;
  onClose: () => void;
  onShowShortcuts: () => void;
}

const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "orbit",
    title: "Look around",
    body: "Drag to orbit, scroll to zoom and right-drag to pan. Press F to focus and R to return to the start.",
  },
  {
    icon: "layers",
    title: "Explore your scene",
    body: "Objects and lights live on the left. Click one to see what it's made of, or double-click to fly to it.",
  },
  {
    icon: "sparkles",
    title: "Choose a Look",
    body: "The Look Studio is on the right. Original is ready now, and Cartoon, Dreamy, Retro and more are on the way.",
  },
];

export function WelcomeDialog({ open, onClose, onShowShortcuts }: WelcomeDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Welcome to Game Look Lab"
      hideTitle
      size="lg"
      className="welcome"
      footer={
        <>
          <Button variant="ghost" icon="keyboard" onClick={onShowShortcuts}>
            Keyboard shortcuts
          </Button>
          <Button variant="primary" size="lg" onClick={onClose} data-autofocus>
            Start exploring
          </Button>
        </>
      }
    >
      <div className="welcome__hero">
        <WelcomeDoodles />
        <div className="welcome__brand">
          <LogoMark size={46} />
          <Wordmark size="lg" />
        </div>
        <p className="welcome__headline">
          Find your game&rsquo;s <span className="highlight highlight--pink">visual identity</span>.
        </p>
        <p className="welcome__lede">
          Try different art styles on a 3D scene and see which one feels like your game. We&rsquo;ve set up a
          small demo scene so you can start looking around straight away.
        </p>
      </div>

      <ol className="welcome__steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="welcome__step">
            <span className="welcome__tape" aria-hidden="true" />
            <span className="welcome__step-head">
              <span className="welcome__step-icon">
                <Icon name={step.icon} size={20} />
              </span>
              <span className="welcome__step-number" aria-hidden="true">
                {index + 1}
              </span>
            </span>
            <h3 className="welcome__step-title">{step.title}</h3>
            <p className="welcome__step-body">{step.body}</p>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

/** Margin doodles: a star, a squiggle and a few sparkles, drawn as if by pen. */
function WelcomeDoodles() {
  return (
    <svg className="welcome__doodles" viewBox="0 0 760 240" preserveAspectRatio="xMaxYMin meet" aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M650 38l9 21 23 3-17 15 5 23-20-12-20 12 5-23-17-15 23-3z"
          stroke="#171d35"
          strokeWidth="2"
          fill="#f8d978"
          transform="rotate(8 650 70)"
        />
        <path d="M560 34c10-12 22 12 32 0s22 12 32 0" stroke="#a8365f" strokeWidth="2.2" />
        <path d="M716 136c-14 2-22 12-18 22s20 8 20-4-14-14-24-6" stroke="#2c6e99" strokeWidth="2" />
        <path d="M600 110c.6 4 2 5.4 6 6-4 .6-5.4 2-6 6-.6-4-2-5.4-6-6 4-.6 5.4-2 6-6z" fill="#171d35" />
        <path d="M708 70c.5 3 1.5 4 4.5 4.5-3 .5-4 1.5-4.5 4.5-.5-3-1.5-4-4.5-4.5 3-.5 4-1.5 4.5-4.5z" fill="#a8365f" />
        <circle cx="545" cy="78" r="3" fill="#a9d9f5" stroke="#171d35" strokeWidth="1.4" />
      </g>
    </svg>
  );
}
