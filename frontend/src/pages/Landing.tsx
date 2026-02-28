import Frame from "../components/Frame";
import { useState } from "react";

function Landing() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("Email", email);

      const res = await fetch("/api/rsvp", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to submit");
      }

      setSubmitted(true);
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const [currentSection, setCurrentSection] = useState("overview");

  const sections = [
    { id: "overview", label: "Overview" },
    { id: "qualifying", label: "Qualifying" },
    { id: "event", label: "Event Details" },
    { id: "travel", label: "Travel" },
    { id: "parents", label: "For Parents" },
  ];

  return (
    <div className="w-screen h-full flex flex-col justify-center bg-blue overflow-hidden">
      <title>Fallout: Hardware Hackathon</title>
      <meta
        name="description"
        content="A seven-day hardware hackathon in ShenZhen, China in 2026. Design hardware projects, build them, & qualify!"
      />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Fallout: Hardware Hackathon" />
      <meta
        property="og:description"
        content="A seven-day hardware hackathon in ShenZhen, China in 2026. Design hardware projects, build them, & qualify!"
      />
      <meta property="og:site_name" content="Fallout" />

      <section className="relative w-full min-h-svh h-[120vh] flex flex-col items-center pt-4 md:p-5 gap-4">
        <img
          className="absolute inset-0 w-full h-full object-cover 2xl:object-top z-0"
          src="/landing/bg.png"
          alt=""
          aria-hidden="true"
        />
        <div className="flex h-8 gap-4 z-1 ">
          <img className="w-auto h-full " src="/fallout.svg" alt="fallout" />
          <img className="w-auto h-full" src="/hackclub.svg" alt="hackclub" />
        </div>

        <div className="z-1 flex flex-col items-center w-full  md:px-0 mt-14 gap-4">
          <div className="text-white text-lg md:text-xl lg:text-2xl tracking-[5%]">
            July 1-7, 2026
          </div>
          <h1 className="text-white text-center tracking-[5%] text-shadow-md text-shadow-blue">
            <span className="text-md">Build 60h of hardware projects,</span>
            <br />
            Go to ShenZhen!
          </h1>

          <Frame width={600} height={150} className="max-w-full ml-1">
            <form
              className="w-full h-full flex xs:px-2 text-xl items-center justify-between"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                className=" w-[140px] md:w-[240px] lg:w-[320px] py-2.5 md:py-3 text-base sm:text-3xl placeholder-brown outline-none"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                required
              />
              <button
                className="cursor-pointer disabled:opacity-50 w-fit h-fit"
                aria-label="Submit"
                disabled={submitting}
              >
                <span className="text-light-brown font-bold whitespace-nowrap text-base sm:text-2xl border-2 border-dark-brown px-2 sm:px-6 py-2 bg-brown">
                  {submitting ? "..." : "RSVP"}
                </span>
              </button>
            </form>
          </Frame>
          {error && (
            <p role="alert" className="text-red-400 text-lg">
              {error}
            </p>
          )}
          {submitted && (
            <p role="status" className="text-green-400 text-lg">
              You're on the list!
            </p>
          )}
        </div>
      </section>

      <div className="-mt-10 mb-20 py-4 w-full">
        <div className="w-[110%] overflow-hidden -translate-x-2 -rotate-2 bg-dark-brown text-white text-3xl py-8 z-10 relative">
          <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee 18s linear infinite;
        }
        .marquee-track:hover {
          animation-play-state: paused;
        }
      `}</style>
          <ul
            className="marquee-track list-none m-0 p-0 text-2xl"
            aria-label="Event highlights"
          >
            {[
              "Teens 13-18",
              "Everything's free",
              "100+ students",
              "For teens worldwide",
              "Teens 13-18",
              "Everything's free",
              "100+ students",
              "For teens worldwide",
            ].map((item, i) => (
              <li key={i} className="flex items-center">
                <span className="mx-10 text-4xl">{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative w-full overflow-hidden -mt-2 xs:-mt-10">
          <video
            className="w-full h-full object-cover"
            src="/landing/video.mov"
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="absolute inset-0 bg-blue/40"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-6xl font-bold text-center">
              It's one of a kind.
            </span>
          </div>
        </div>
      </div>

      <section className="pb-10 bg-blue">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 w-full gap-6 p-6 md:px-20">
          <div className="min-w-60 bg-green rounded-xl p-8 pb-12 space-y-4 text-center flex flex-col items-center text-white tracking-[5%]">
            <h2 className="font-bold">DESIGN</h2>
            <div className="w-full bg-white/40 rounded-xl aspect-2/1"></div>
            <h3 className="font-medium">Design. Learn. Repeat.</h3>
            <ol className="list-decimal list-inside text-left text-2xl">
              <li>Design your project</li>
              <li>Submit &gt; Get approved</li>
              <li>Receive a grant to buy parts!</li>
            </ol>
          </div>
          <div className="min-w-60 bg-[#F5C634] rounded-xl p-8 pb-12 space-y-4 text-center flex flex-col items-center text-white tracking-[5%]">
            <h2 className="font-bold">BUILD</h2>
            <div className="w-full bg-white/40 rounded-xl aspect-2/1"></div>
            <h3 className="font-medium">Build. Iterate. Repeat.</h3>
            <span className="text-2xl font-light text-left">
              Buy the parts with your grant & Build your project!
            </span>
          </div>
          <div className="min-w-60 bg-[#F761BD] rounded-xl p-8 pb-12 space-y-4 text-center flex flex-col items-center text-white tracking-[5%]">
            <h2 className="font-bold">SHARE</h2>
            <div className="w-full bg-white/40 rounded-xl aspect-2/1"></div>
            <h3 className="font-medium">Share it with the world!</h3>
            <span className="text-2xl font-light text-left">
              Demo through a video, and post it online --Ship your project!
            </span>
          </div>
        </div>
      </section>

      <section className="text-white text-center space-y-4 flex flex-col justify-between">
        <div className="h-40"></div>
        <div className="relative min-h-[30vh] flex flex-col items-center justify-center text-center gap-4">
          <span className="tracking-[5%] text-6xl sm:text-8xl font-bold">
            SHENZHEN
          </span>
          <span className="text-2xl tracking-[5%] font-light px-2">
            <i>Can't make it? get prizes like a 3D printer in our shop!</i>
          </span>
          <img
            src="/landing/fish_1.png"
            alt=""
            className="w-80 sm:w-120 h-auto absolute  bottom-30 -left-1/3 lg:left-10 sm:bottom-0"
          />
          <img
            src="/landing/stingray.png"
            alt=""
            className="w-60 sm:w-100 h-auto absolute -top-80 right-0 lg:right-30"
          />
          <img
            src="/landing/fish_2.png"
            alt=""
            className="w-40 sm:w-60 h-auto absolute -bottom-40 lg:-bottom-20 -right-10 lg:right-0"
          />
        </div>

        <div className="relative w-full h-40 overflow-x-hidden">
          <img
            src="/clouds/4.png"
            alt=""
            className="absolute bottom-0 left-0 h-30 md:h-40 -translate-x-1/3 z-0"
          />
          <img
            src="/clouds/1.png"
            alt=""
            className="absolute bottom-0 left-40 h-30 translate-x-1/3 z-0"
          />
          <img
            src="/clouds/2.png"
            alt=""
            className="absolute bottom-0 right-0 -translate-x-5/6 h-30 z-0"
          />
          <img
            src="/clouds/3.png"
            alt=""
            className="absolute bottom-0 right-0 h-30 md:h-40 w-auto translate-x-1/3 z-0"
          />
        </div>
      </section>

      <div className="w-full flex flex-col md:flex-row items-stretch min-h-[500px] h-[40vh] py-20 px-8">
        <div
          role="tablist"
          aria-label="Event information"
          className="flex-1/4 flex flex-wrap sm:flex-col justify-center whitespace-nowrap gap-3 h-full"
        >
          {sections.map((section) => (
            <button
              key={section.id}
              role="tab"
              aria-selected={currentSection === section.id}
              aria-controls={`panel-${section.id}`}
              id={`tab-${section.id}`}
              onClick={() => setCurrentSection(section.id)}
              className={`py-2 rounded-md text-2xl
            ${currentSection === section.id ? "text-yellow font-semibold" : "text-white"}`}
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="w-full text-left text-white h-full sm:border-l-2 py-4">
          {sections.map((section) => (
            <div
              key={section.id}
              role="tabpanel"
              id={`panel-${section.id}`}
              aria-labelledby={`tab-${section.id}`}
              hidden={currentSection !== section.id}
              className="md:px-20"
            >
              {section.id === "overview" && (
                <>
                  <h2 className="text-2xl font-semibold mb-2">OVERVIEW</h2>
                  <p>content</p>
                </>
              )}
              {section.id === "qualifying" && (
                <>
                  <h2 className="text-2xl font-semibold mb-2">QUALIFYING</h2>
                  <p>content</p>
                </>
              )}
              {section.id === "event" && (
                <>
                  <h2 className="text-2xl font-semibold mb-2">
                    WHAT IS SHIPPING
                  </h2>
                  <p>content</p>
                </>
              )}
              {section.id === "travel" && (
                <>
                  <h2 className="text-2xl font-semibold mb-2">
                    TRAVEL & EVENT
                  </h2>
                  <p>content</p>
                </>
              )}
              {section.id === "parents" && (
                <>
                  <h2 className="text-2xl font-semibold mb-2">FOR PARENTS</h2>
                  <p>content</p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="bg-dark-brown text-white text-center py-8">
        <p className="text-xl font-medium">
          Fallout is made with ♡ by teenagers, for teenagers
        </p>
        <div className="space-x-4 mt-2">
          <a
            href="https://hackclub.com"
            target="_blank"
            rel="noreferrer"
            className="underline text-xl"
          >
            Hack Club
          </a>
          <a
            href="https://hackclub.com/slack"
            target="_blank"
            rel="noreferrer"
            className="underline text-xl"
          >
            Join Our Slack
          </a>
        </div>
      </footer>
    </div>
  );
}
export default Landing;
