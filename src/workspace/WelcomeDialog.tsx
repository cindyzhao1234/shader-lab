import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon, type IconName } from "../ui/Icon";
import { LogoMark } from "./LogoMark";

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
        <LogoMark size={44} />
        <p className="eyebrow">Welcome to Game Look Lab</p>
        <p className="welcome__headline">Find your game&rsquo;s visual identity.</p>
        <p className="welcome__lede">
          Try different art styles on a 3D scene and see which one feels like your game. We&rsquo;ve set up a
          small demo scene so you can start looking around straight away.
        </p>
      </div>

      <ol className="welcome__steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="welcome__step">
            <span className="welcome__step-icon">
              <Icon name={step.icon} size={20} />
            </span>
            <span className="welcome__step-number">{index + 1}</span>
            <h3 className="welcome__step-title">{step.title}</h3>
            <p className="welcome__step-body">{step.body}</p>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
