type BubbleProps = {
    text: string;
    bg?: string;
    dir?: string;
};

const SpeechBubble = ({ text, bg = "white", dir = ""}: BubbleProps) => (
    <div className={`relative bg-${bg} h-auto w-auto p-3 sm:px-6 sm:py-4 rounded-2xl border-2 border-dark-brown`}>
        <span className="relative z-1 text-base lg:text-lg text-dark-brown text-center font-bold">{text}</span>
        {dir === "" ? (
            <svg className="absolute -bottom-4 left-1/2 -translate-x-1/2" width="24" height="16" viewBox="0 0 24 16">
                <polygon points="0,0 24,0 12,16" className="fill-white stroke-dark-brown" strokeWidth="2" />
                <polygon points="1,0 23,0 12,14" className="fill-white" />
            </svg>
        ) : (
            <svg className="absolute -left-4 top-1/2 -translate-y-1/2" width="16" height="24" viewBox="0 0 16 24">
                <polygon points="16,0 16,24 0,12" className="fill-white stroke-dark-brown" strokeWidth="2" />
                <polygon points="16,1 16,23 2,12" className="fill-white" />
            </svg>
        )}
    </div>
);

export default SpeechBubble;
