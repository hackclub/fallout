import SpeechBubble from "../components/SpeechBubble";
import { useEffect, useState } from "react";

const stages = [1, 2, 3, 4];

const options = {
    howHeard: ["Friends/Family", "Instagram/Youtube", "Hack Club Site", "Slack", "Email", "School", "Other"],
    experience: [
        "I’m new to hardware!",
        "I’ve made guided projects!",
        "I’ve made projects beyond guides!",
        "I live and breathe hardware"
    ]
};

const stageOne = [ 
    "Hi there! I’m Soup!",
    "And I’m hungry",
    "Build hardware projects to get koi fish, & feed me!",
    "In exchange, I’ll give you prizes! Maybe an invite to our base in Shenzhen... "
];

function Onboarding() {
    const [stage, setStage] = useState(1);
    const [answers, setAnswers] = useState({
        howHeard: null,
        experience: null,
    });

    const [textIndex, setTextIndex] = useState(0)

    useEffect(() => {
    if (stage !== 1) return;
    if (textIndex >= stageOne.length - 1) return;
    const timer = setTimeout(() => {
        setTextIndex(i => i + 1);
    }, 2000);
    return () => clearTimeout(timer);
}, [textIndex, stage]); 

function advanceText() {
    if (textIndex < stageOne.length - 1) {
        setTextIndex(i => i + 1);
    } else {
        onButtonClick();
    }
}
  
   
    const currentStageIndex = stages.indexOf(stage);
    const progress = (currentStageIndex / (stages.length - 1)) * 100;

    function onButtonClick() {
        if (currentStageIndex < stages.length - 1) {
            setStage(stages[currentStageIndex + 1]);

        }
    }

    function onBack() {
        if (currentStageIndex > 0) {
            const prevStage = stages[currentStageIndex - 1];
            setStage(prevStage);
            setTextIndex(0);
        }
    }

    function onSelect(key, value) {
        setAnswers(prev => ({ ...prev, [key]: value }));
    }

    return (
        <div className="w-screen h-screen min-h-[600px] overflow-y-hidden bg-light-blue flex flex-col items-center text-dark-brown p-4 text-center text-xl lg:text-2xl">
            <div className="w-full lg:w-[50%] bg-white rounded-full h-4 z-50">
                <div
                    className="bg-blue h-4 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="absolute bottom-0 left-0 bg-light-green h-[80%] max-h-200 w-full"></div>
            <div className="z-20 absolute bottom-5 right-5 flex items-end gap-8">
                <button className="text-2xl underline cursor-pointer" onClick={onBack}>go back</button>
                <button
                    className="py-4 px-10 bg-dark-brown text-light-brown rounded-xl font-bold text-2xl hover:bg-light-brown hover:text-dark-brown transition-all border-dark-brown border-2"
                    onClick={onButtonClick}
                >
                    continue
                </button>
            </div>

            {stage === 1 && (
                <section onMouseDown={advanceText} className="relative z-1 w-full flex-1 flex justify-center items-center flex-col">
                    <SpeechBubble text={stageOne[textIndex]} />
                    <img src="/soup.gif" className="w-100 h-auto" />
                </section>
            )}

            {stage === 2 && (
                <section onMouseDown={advanceText} className="relative z-1 w-full flex-1 pt-10 flex flex-col items-center lg:justify-center">
                    <div className="flex items-center">
                        <img src="/soup.gif" className="w-40 lg:w-60 h-auto" />
                        <SpeechBubble dir="left" text="How did you hear about Fallout?" />
                    </div>
                    <ul className="grid grid-cols-2 gap-2 w-full lg:w-[50%] lg:min-w-[400px]">
                        {options.howHeard.map((option) => (
                            <li key={option}>
                                <button
                                    className={`w-full min-h-24 rounded-xl lg:text-left lg:pl-20 cursor-pointer ease-in-out transition-all hover:scale-104 hover:border-2 hover:border-dark-brown p-2
                                        ${answers.howHeard === option ? "bg-dark-brown text-light-brown" : "bg-white"}`}
                                    onClick={() => onSelect("howHeard", option)}
                                >
                                    {option}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {stage === 3 && (
                <section onMouseDown={advanceText} className="relative z-1 w-full flex-1 pt-10 flex flex-col items-center lg:justify-center">
                    <div className="flex items-center">
                        <img src="/soup.gif" className="w-40 lg:w-60 h-auto" />
                        <SpeechBubble dir="left" text="What's your hardware experience?" />
                    </div>
                    <ul className="space-y-2 lg:space-y-6 w-full lg:w-[50%] lg:min-w-[400px] ">
                        {options.experience.map((option) => (
                            <li key={option}>
                                <button
                                    className={`w-full min-h-24 rounded-xl lg:text-left lg:pl-20 cursor-pointer ease-in-out transition-all  hover:scale-104 hover:border-2 hover:border-dark-brown
                                        ${answers.experience === option ? "bg-dark-brown text-light-brown" : "bg-white"}`}
                                    onClick={() => onSelect("experience", option)}
                                >
                                    {option}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {stage === 4 && (
                <section onMouseDown={advanceText} className="relative z-1 w-full flex-1 flex justify-center items-center flex-col">
                    <SpeechBubble text="Remember to timelapse your work!" />
                    <img src="/soup.gif" className="w-100 max-w-full h-auto" />
                </section>
            )}
        </div>
    );
}

export default Onboarding;