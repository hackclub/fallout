type BubbleProps = {
    text: string;
    bg?: string;
    dir?: string;
};


const SpeechBubble = ({ text, bg = "white", dir = ""}: BubbleProps) => (
    <div className={`relative bg-${bg} h-auto w-auto p-4 sm:px-10 sm:py-6 rounded-lg`}>
        <span className="relative z-1 text-xl lg:text-2xl text-dark-brown text-center font-bold">{text}</span>
        <div className={`absolute w-14 h-14 bg-${bg} rotate-45 rounded-sm z-0
        ${
            dir === "" ? "-bottom-2 left-1/2 -translate-x-1/2": "-left-2 bottom-1/2 translate-y-1/2"
        }`}>

        </div>
    </div>

);

export default SpeechBubble;