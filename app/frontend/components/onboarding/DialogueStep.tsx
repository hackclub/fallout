import SpeechBubble from "./SpeechBubble";

interface DialogueStepProps {
  step: {
    prompt: string;
  };
}

export default function DialogueStep({ step }: DialogueStepProps) {
  return (
    <section className="relative z-1 w-full flex-1 flex justify-center items-center flex-col">
      <SpeechBubble text={step.prompt} />
      <img src="/onboarding/chinese_heidi.gif" className="w-60 lg:w-72 max-w-full h-auto" />
    </section>
  );
}
