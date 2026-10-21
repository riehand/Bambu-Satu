import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      
      {/* 1. NAVBAR */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-[1400px] mx-auto bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2 text-xl font-bold text-brand-dark">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          WellBeing Hub
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <Link href="#how-it-works" className="hover:text-brand-dark">How it works</Link>
          <Link href="#psychologist" className="hover:text-brand-dark">Find a psychologist</Link>
          <Link href="#privacy" className="hover:text-brand-dark">Privacy</Link>
          <Link href="#faqs" className="hover:text-brand-dark">FAQs</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/auth/login" className="text-sm font-medium border border-gray-300 px-5 py-2.5 rounded-full hover:bg-gray-50">Log in</Link>
          <Link href="/auth/register" className="text-sm font-medium bg-brand-dark text-white px-5 py-2.5 rounded-full hover:bg-brand-soft transition-colors">Get started</Link>
        </div>
      </nav>

      {/* 2. HERO SECTION[cite: 26] */}
      <section className="bg-brand-mint/40">
        <div className="max-w-[1400px] mx-auto px-8 pt-16 pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="max-w-xl">
            <p className="text-sm font-bold text-brand-dark mb-4">A little clarity. A step toward care.</p>
            <h1 className="text-5xl lg:text-[4rem] font-bold text-gray-900 leading-[1.1] mb-6 tracking-tight">
              Your mind matters.<br/>Make room for your wellbeing.
            </h1>
            <p className="text-lg text-gray-600 mb-10 leading-relaxed">
              A calmer space for students and lecturers at Telkom University to reflect, understand their wellbeing, and connect with support.
            </p>
            <div className="flex flex-wrap gap-4 mb-8">
              <Link href="/auth/register" className="px-6 py-3.5 bg-brand-dark text-white font-medium rounded-full hover:bg-brand-soft transition-colors flex items-center gap-2">
                &rarr; Start Assessment
              </Link>
              <Link href="#support" className="px-6 py-3.5 bg-white text-gray-700 font-medium rounded-full border border-gray-300 hover:bg-gray-50 transition-colors">
                Explore support
              </Link>
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Private by default &middot; 10–15 minutes &middot; Your pace
            </p>
          </div>
          
          <div className="relative w-full h-[500px] rounded-[2.5rem] overflow-hidden bg-gray-200">
            {/* Ganti src dengan gambar hero dari Figma Anda */}
            <img src="/images/hero.jpg" alt="Student smiling" className="w-full h-full object-cover" />
            <div className="absolute bottom-6 left-6 right-6 bg-white/95 backdrop-blur rounded-2xl p-5 shadow-lg flex items-start gap-4">
              <div className="bg-brand-mint p-3 rounded-full text-brand-dark"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg></div>
              <div>
                <h4 className="font-bold text-gray-900">You don't have to figure it out alone.</h4>
                <p className="text-sm text-gray-600">Reflection first. Support when you're ready.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Value Props Bottom Hero[cite: 26] */}
        <div className="max-w-[1400px] mx-auto px-8 pb-16 grid md:grid-cols-3 gap-8 border-b border-gray-200">
          <div>
            <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-brand-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Your information, your choice
            </h4>
            <p className="text-sm text-gray-500 pl-7">Separate consent for every kind of sharing.</p>
          </div>
          <div>
            <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-brand-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              Structured self-reflection
            </h4>
            <p className="text-sm text-gray-500 pl-7">DASS-21 and WEMWBS questionnaires.</p>
          </div>
          <div>
            <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-brand-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              Human support
            </h4>
            <p className="text-sm text-gray-500 pl-7">Connect with a psychologist on your terms.</p>
          </div>
        </div>
      </section>

      {/* 3. PLATFORM & ASSESSMENT OVERVIEW[cite: 24] */}
      <section id="how-it-works" className="py-24 max-w-[1400px] mx-auto px-8">
        <p className="text-xs font-bold tracking-widest text-brand-dark uppercase mb-4">Thoughtfully Connected</p>
        <h2 className="text-4xl font-bold text-gray-900 mb-3">Small steps. Meaningful understanding.</h2>
        <p className="text-lg text-gray-600 mb-12">Everything you need to begin caring for your mental wellbeing, in one calm space.</p>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          {[
            { title: "Check in with yourself", desc: "Reflect on feelings and everyday wellbeing with two structured questionnaires.", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" },
            { title: "See the bigger picture", desc: "Understand your results, revisit your history, and take a report with you.", icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" },
            { title: "Find your kind of support", desc: "Explore psychologist profiles and choose a session that fits your schedule.", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
            { title: "A space to reflect", desc: "An optional AI companion for everyday reflection. Always your choice to share.", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" }
          ].map((feature, i) => (
            <div key={i} className="border border-gray-200 rounded-3xl p-8 flex flex-col hover:shadow-lg transition-shadow bg-white">
              <svg className="w-8 h-8 text-brand-dark mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={feature.icon} /></svg>
              <h3 className="font-bold text-xl text-gray-900 mb-4">{feature.title}</h3>
              <p className="text-gray-600 text-sm flex-grow mb-8">{feature.desc}</p>
              <Link href="#" className="text-brand-dark font-medium text-sm hover:underline">Explore feature &rarr;</Link>
            </div>
          ))}
        </div>

        <p className="text-xs font-bold tracking-widest text-brand-dark uppercase mb-4">At your pace</p>
        <h2 className="text-4xl font-bold text-gray-900 mb-12">From a check-in to your next step.</h2>
        
        <div className="grid md:grid-cols-3 gap-12 mb-20">
          <div>
            <div className="text-3xl font-bold text-brand-dark mb-2">01</div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Create your private space</h3>
            <p className="text-gray-600 text-sm">Use your campus identity to create an account. Review what is collected and why.</p>
          </div>
          <div>
            <div className="text-3xl font-bold text-brand-dark mb-2">02</div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Take a mindful check-in</h3>
            <p className="text-gray-600 text-sm">Answer 35 questions about your recent experiences. Your progress is saved.</p>
          </div>
          <div>
            <div className="text-3xl font-bold text-brand-dark mb-2">03</div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Choose what comes next</h3>
            <p className="text-gray-600 text-sm">Explore your results, download a report, or connect with a psychologist.</p>
          </div>
        </div>

        {/* Dark Banner[cite: 24] */}
        <div className="bg-[#1A3626] rounded-3xl p-12 lg:p-16 grid lg:grid-cols-2 gap-12 items-center text-white">
          <div>
            <h2 className="text-4xl font-bold mb-4 leading-tight">Understand how you've been feeling, not who you are.</h2>
            <p className="text-gray-300">A questionnaire is a starting point for reflection—not a diagnosis or a label.</p>
          </div>
          <div className="space-y-8">
            <div>
              <h3 className="font-bold text-xl text-brand-soft mb-1">DASS-21</h3>
              <p className="text-sm text-gray-300 mb-2">21 questions &middot; Past week</p>
              <p className="text-sm text-gray-200">Explores depression, anxiety, and stress symptoms.</p>
            </div>
            <div>
              <h3 className="font-bold text-xl text-brand-soft mb-1">WEMWBS</h3>
              <p className="text-sm text-gray-300 mb-2">14 questions &middot; Past two weeks</p>
              <p className="text-sm text-gray-200">Explores positive mental wellbeing on a 14–70 scale.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HUMAN CARE AND PRIVACY */}
      <section id="psychologist" className="py-24 max-w-[1400px] mx-auto px-8 border-t border-gray-100">
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
          <div className="rounded-[2.5rem] overflow-hidden bg-gray-200 h-[450px]">
             {/* Ganti src dengan gambar psikolog dari Figma Anda */}
            <img src="/images/human-connection.jpg" alt="Psychologist laughing" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-xs font-bold tracking-widest text-brand-dark uppercase mb-4">Human Connection</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Support that starts with listening.</h2>
            <p className="text-gray-600 mb-8">Find a psychologist whose experience fits your needs. Read their profile, explore available sessions, and decide what feels right for you.</p>
            
            <ul className="space-y-4 mb-8">
              {['Student wellbeing and work-life expertise', 'Private online sessions in clear time windows', 'Report sharing only with your permission'].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                  <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className="inline-flex px-6 py-3.5 bg-[#2C6E49] text-white font-medium rounded-full hover:bg-brand-dark transition-colors items-center gap-2">
              &rarr; Find a psychologist
            </Link>
            <p className="text-xs text-gray-400 mt-4">Profiles shown in this design are fictional examples.</p>
          </div>
        </div>

        {/* Privacy Box[cite: 23] */}
        <div id="privacy" className="bg-[#F6FAF7] rounded-[2.5rem] p-12 lg:p-16 grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <svg className="w-10 h-10 text-brand-dark mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            <p className="text-xs font-bold tracking-widest text-brand-dark uppercase mb-4">Trust Comes First</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Care without giving up control.</h2>
            <p className="text-gray-600">Your results belong to you. Consent is specific, understandable, and reversible.</p>
          </div>
          <div className="space-y-8">
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Private reports</h3>
              <p className="text-sm text-gray-600">Psychologists only see the reports you explicitly share with them.</p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Optional AI</h3>
              <p className="text-sm text-gray-600">External AI sharing stays off until you give separate permission.</p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Clear controls</h3>
              <p className="text-sm text-gray-600">Review consent history and revoke access from your privacy settings.</p>
            </div>
            <Link href="#" className="inline-block text-brand-dark font-medium text-sm hover:underline mt-2">
              Read our privacy approach &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* 5. RESOURCES AND NEXT STEPS[cite: 25] */}
      <section className="py-24 max-w-[1400px] mx-auto px-8">
        <p className="text-xs font-bold tracking-widest text-brand-dark uppercase mb-4">Everyday Wellbeing</p>
        <h2 className="text-4xl font-bold text-gray-900 mb-2">A little care, between check-ins.</h2>
        <p className="text-gray-600 mb-12">Simple ideas to make room for rest, connection, and reflection.</p>
        
        <div className="grid md:grid-cols-3 gap-6 mb-24">
          {[
            { icon: "M14 5l7 7m0 0l-7 7m7-7H3", title: "A gentler way to reset", desc: "Try a quiet pause between study sessions.", read: "3 MIN READ" },
            { icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z", title: "Make space for better rest", desc: "Build a bedtime routine that works for you.", read: "4 MIN READ" },
            { icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z", title: "Starting a conversation", desc: "How to tell someone you could use support.", read: "3 MIN READ" }
          ].map((article, i) => (
            <div key={i} className="border border-gray-200 rounded-3xl p-8 flex flex-col hover:shadow-lg transition-shadow bg-white">
              <svg className="w-6 h-6 text-brand-dark mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={article.icon} /></svg>
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">PAUSE &middot; {article.read}</p>
              <h3 className="font-bold text-xl text-gray-900 mb-3">{article.title}</h3>
              <p className="text-gray-600 text-sm flex-grow mb-8">{article.desc}</p>
              <Link href="#" className="text-brand-dark font-medium text-sm hover:underline">Read article &rarr;</Link>
            </div>
          ))}
        </div>

        {/* FAQs[cite: 25] */}
        <div id="faqs" className="grid lg:grid-cols-12 gap-12 pt-12 border-t border-gray-100">
          <div className="lg:col-span-4">
            <p className="text-xs font-bold tracking-widest text-brand-dark uppercase mb-4">A Little More Clarity</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Questions are welcome.</h2>
            <p className="text-gray-600 mb-8">Here are a few things you may want to know before getting started.</p>
            <Link href="#" className="text-brand-dark font-medium text-sm hover:underline">Visit the help center &rarr;</Link>
          </div>
          
          <div className="lg:col-span-8 space-y-6">
            <div className="border-b border-gray-200 pb-6">
              <h4 className="font-bold text-gray-900 text-lg flex justify-between items-center mb-4">
                Is an assessment a diagnosis? <span>&minus;</span>
              </h4>
              <p className="text-gray-600 text-sm">No. Results describe your responses and can support reflection or a conversation with a professional. They do not provide a diagnosis.</p>
            </div>
            {['Who can see my results?', 'Do I have to use the AI companion?', 'Can I pause an assessment?', 'What if I need urgent help?'].map((faq, i) => (
              <div key={i} className="border-b border-gray-200 pb-6">
                <h4 className="font-bold text-gray-900 text-lg flex justify-between items-center cursor-pointer">
                  {faq} <span>+</span>
                </h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. BOTTOM CTA & FOOTER[cite: 25] */}
      <section className="bg-[#E7F6EC] py-32 text-center px-8">
        <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6 max-w-3xl mx-auto leading-tight">
          A moment for yourself<br/>can be a meaningful beginning.
        </h2>
        <p className="text-gray-600 mb-10 text-lg">Start with a private check-in. Choose your next step when you're ready.</p>
        <Link href="/auth/register" className="inline-flex px-8 py-4 bg-[#2C6E49] text-white font-semibold rounded-full hover:bg-brand-dark transition-colors items-center gap-2">
          &rarr; Start Assessment
        </Link>
      </section>

      <footer className="bg-white pt-20 pb-12 px-8 max-w-[1400px] mx-auto">
        <div className="grid md:grid-cols-12 gap-12 mb-20">
          <div className="md:col-span-8">
            <div className="flex items-center gap-2 text-xl font-bold text-gray-900 mb-4">
              <svg className="w-6 h-6 text-brand-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              WellBeing Hub
            </div>
            <p className="text-sm text-gray-500 max-w-xs">A private wellbeing space for students and lecturers at Telkom University.</p>
          </div>
          
          <div className="md:col-span-2">
            <h5 className="font-bold text-gray-900 mb-4 text-sm">Explore</h5>
            <ul className="space-y-3 text-sm text-gray-500">
              <li><Link href="#" className="hover:text-gray-900">Assessment</Link></li>
              <li><Link href="#" className="hover:text-gray-900">Psychologists</Link></li>
              <li><Link href="#" className="hover:text-gray-900">Resources</Link></li>
            </ul>
          </div>
          
          <div className="md:col-span-2">
            <h5 className="font-bold text-gray-900 mb-4 text-sm">Trust & help</h5>
            <ul className="space-y-3 text-sm text-gray-500">
              <li><Link href="#" className="hover:text-gray-900">Privacy policy</Link></li>
              <li><Link href="#" className="hover:text-gray-900">Terms of use</Link></li>
              <li><Link href="#" className="hover:text-gray-900">Help center</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-8 text-xs text-gray-400 text-center md:text-left">
          &copy; 2026 WellBeing Hub &middot; Fictional product design. Not an emergency service. For urgent concerns, contact local emergency services or your nearest emergency department.
        </div>
      </footer>

    </div>
  );
}