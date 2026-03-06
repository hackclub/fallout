import SpeechBubble from "./SpeechBubble";

interface SingleChoiceStepProps {
  step: {
    prompt: string;
    options: string[];
  };
  selected: string | null;
  onSelect: (answer: string) => void;
}

export default function SingleChoiceStep({ step, selected, onSelect }: SingleChoiceStepProps) {
  return (
    <section className="relative z-1 w-full flex-1 pt-6 flex flex-col items-center lg:justify-center">
      <div className="flex items-center">
        <img src="/onboarding/chinese_heidi.gif" className="w-28 lg:w-40 h-auto" />
        <SpeechBubble dir="left" text={step.prompt} />
      </div>
      <ul className="flex flex-col gap-2 lg:gap-3 w-full lg:w-[40%] lg:min-w-80">
        {step.options.map((option) => (
          <li key={option}>
            <button
              className={`w-full min-h-14 rounded-xl cursor-pointer ease-in-out transition-all hover:scale-104 p-2 border-2 border-dark-brown
                ${selected === option ? "bg-dark-brown text-light-brown" : "bg-white"}`}
              onClick={() => onSelect(option)}
            >
              {option}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
