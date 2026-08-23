export const en = {
  nav: {
    home: "Home",
    products: "Our Products",
    services: "Services",
    admin: "Admin",
    bookDemo: "Book a Demo",
    signIn: "Sign in",
    myDashboard: "My dashboard",
    contact: "Contact",
    menu: "Menu",
  },
  home: {
    heroLine1: "Autonomous robots that",
    heroLine2: "work your land, every hour",
    heroSub:
      "One autonomous robot, built and operated by ROBOTAT for orchards, row crops, protected agriculture, and solar sites across the region.",
    bookAssessment: "Book a site assessment",
    marqueeLabel: "ROBOTAT · Field",

    capsTag: "What they do",
    capsTitle1: "Eyes on every row.",
    capsTitle2: "Action in every hour",
    capsSub:
      "Five capabilities the ROBOTAT fleet delivers across orchards, row crops, and protected agriculture — measurable, repeatable, and integrated with your farm operating systems.",
    capabilities: [
      {
        title: "Crop scouting & health",
        desc: "Multispectral and visual imaging across every row — disease, pests, and nutrient stress flagged before the eye can see them.",
      },
      {
        title: "Precision spraying",
        desc: "Targeted application of pesticides, herbicides, and fertilizer — plant-by-plant. Less chemical use, lower drift, better outcomes.",
      },
      {
        title: "Irrigation & soil mapping",
        desc: "Soil moisture, salinity, and topography mapped continuously. Irrigation runs by zone, by need — not by schedule.",
      },
      {
        title: "Yield estimation & harvest support",
        desc: "Counting, sizing, and ripeness assessment before harvest. Plan logistics, labor, and storage with hard numbers instead of guesses.",
      },
      {
        title: "Greenhouse & livestock monitoring",
        desc: "Climate inside, animals outside. Continuous welfare and condition checks for protected agriculture and pasture livestock.",
      },
    ],

    envTag: "Where it works",
    envTitle1: "One robot.",
    envTitle2: "Every environment",
    envSub:
      "The MAX T100 doesn't change — the attachment does. One platform covers open fields, protected agriculture, and solar sites.",
    environments: [
      {
        type: "— Orchards, vineyards & row crops",
        title: "Drives every row, all season.",
        desc: "Scouts crop health, cultivates soil, and sprays plant-by-plant across orchards, vineyards, and broadacre rows. Low ground pressure, GPS-tight navigation.",
        specs: [
          { label: "Row width", value: "0.9 – 2.4 m" },
          { label: "Tasks", value: "Scout · Cultivate · Spray" },
          { label: "Attachments", value: "X-Cultivator · X-Sprayer" },
        ],
      },
      {
        type: "— Protected & indoor agriculture",
        title: "Climate-aware, all day indoors.",
        desc: "Quiet, compact operation inside greenhouses and vertical farms — scouting and monitoring crop and climate in tight aisles, around the clock.",
        specs: [
          { label: "Aisle width", value: "0.5 m min" },
          { label: "Sensors", value: "RGB + multispectral + temp/RH" },
          { label: "Runtime", value: "All-day operation" },
        ],
      },
      {
        type: "— Solar & infrastructure",
        title: "Keeps the panel rows clear.",
        desc: "Manages vegetation under and between panel rows — preventing shading and fire risk with no mowing crews and zero herbicide.",
        specs: [
          { label: "Coverage", value: "Utility-scale sites" },
          { label: "Tasks", value: "Vegetation control" },
          { label: "Attachment", value: "X-Grass Cutter" },
        ],
      },
    ],

    howTag: "How it works",
    howTitle1: "Deploy. Inspect.",
    howTitle2: "Act",
    howSub:
      "A three-step program from first farm visit to autonomous operation. Most deployments are live within 60 days.",
    phases: [
      {
        tag: "Phase 01",
        titlePlain: "We map your",
        titleAccent: "farm.",
        desc: "A ROBOTAT agronomy team walks your fields, defines scouting and treatment routes, and tailors the mission to your crop and season. No commitment, no charge for the assessment.",
        kv: [
          { label: "Site visit", value: "2–3 days in the field" },
          { label: "Mission plan", value: "Routes, schedules, KPIs" },
          { label: "Fleet sizing", value: "Right-sized for the work" },
        ],
      },
      {
        tag: "Phase 02",
        titlePlain: "Robots",
        titleAccent: "go to work.",
        desc: "Continuous autonomous patrols. Sensors collect inspection data, anomalies are surfaced in real time, and your operators see everything in a single dashboard.",
        kv: [
          { label: "Continuous", value: "24 / 7 autonomous operation" },
          { label: "Data layer", value: "Live to your dashboard" },
          { label: "Traceable", value: "Every patrol logged" },
        ],
      },
      {
        tag: "Phase 03",
        titlePlain: "Findings become",
        titleAccent: "actions.",
        desc: "Findings trigger work orders in your farm management system or ERP. Operators intervene only when they need to. The whole loop — detection to dispatch to resolution — closes automatically.",
        kv: [
          { label: "Integrations", value: "FMS · ERP" },
          { label: "Workflows", value: "Owner, SLA, escalation" },
          { label: "Reports", value: "Weekly to leadership" },
        ],
      },
    ],

    ctaTitle: "Autonomy for the ground beneath us",
    ctaSub:
      "A ROBOTAT agronomist walks your farm in 2–3 days. No commitment. No charge for the assessment.",
    emailTeam: "Email the team",
    metaKingdom: "Available across the Kingdom",
    metaResponse: "Response within 48 hrs",
  },
  auth: {
    welcomeBack: "Welcome back",
    createAccount: "Create your account",
    signInSub: "Sign in to book and track your assessments.",
    registerSub: "Register to book a site assessment.",
    fullName: "Full name",
    email: "Email address",
    password: "Password",
    passwordHint: "At least 8 characters",
    signIn: "Sign in",
    createAccountBtn: "Create account",
    toSignUp: "Don't have an account? Sign up",
    toSignIn: "Already have an account? Sign in",
    forgotLink: "Forgot your password?",
  },
  recover: {
    // Forgot-password request page
    forgotTitle: "Reset your password",
    forgotSub: "Enter your email and we'll send you a link to choose a new password.",
    sendLink: "Send reset link",
    backToSignIn: "Back to sign in",
    checkInbox: "Check your inbox",
    checkInboxSub: "If an account exists for {email}, a reset link is on its way. The link expires in 1 hour.",
    // Reset-password page
    resetTitle: "Choose a new password",
    resetSub: "Enter a new password for your account.",
    newPassword: "New password",
    updatePassword: "Update password",
    resetDone: "Password updated",
    resetDoneSub: "Your password has been changed. You can sign in now.",
    goToSignIn: "Go to sign in",
    badLink: "This link is invalid or has expired.",
    requestNewLink: "Request a new link",
    // Email verification page
    verifyingTitle: "Verifying your email…",
    verifiedTitle: "Email verified",
    verifiedSub: "Thanks — your email address is confirmed.",
    verifyFailedTitle: "Verification failed",
    verifyFailedSub: "This confirmation code is invalid or has expired.",
    continueToDashboard: "Continue to dashboard",
    // Code entry
    enterCodeTitle: "Check your email",
    enterCodeSub: "We sent a 6-digit code to {email}. It expires in 15 minutes.",
    codeLabel: "6-digit confirmation code",
    codeWrong: "That code is not right. Check the digits and try again.",
    codeExhausted: "Too many incorrect codes. Send yourself a new one.",
    resendCode: "Send a new code",
    laterLink: "I'll do this later",
    // Unverified-email banner (dashboard)
    bannerText: "Confirm your email address before booking a site assessment.",
    bannerResend: "Enter your code",
    missingToken: "No code provided.",
  },
  booking: {
    title: "Book a site assessment",
    subtitle: "A ROBOTAT agronomist visits your farm.",
    close: "Close",
    back: "Back",
    howReach: "How would you like to reach us?",
    howReachSub: "Either way we ask for the same details — pick where we reply.",
    whatsapp: "WhatsApp",
    whatsappSub: "Reply in your chats",
    email: "Email",
    emailSub: "Reply in your inbox",
    haveAccount: "Have an account?",
    signInToTrack: "to track your requests.",
    needHelp: "Already a customer and need help?",
    individual: "Individual",
    company: "Company",
    fullName: "Full name *",
    contactName: "Contact name *",
    phone: "Phone",
    emailLabel: "Email *",
    companyName: "Company name *",
    landSize: "Land size (ha)",
    location: "Location / Maps link",
    message: "Message",
    messagePlaceholder: "Tell us about your crop and what you need…",
    companyNamePlaceholder: "Company name",
    sendByEmail: "Send by email",
    sendByWhatsapp: "Continue to WhatsApp",
    companyRequired: "Company name is required",
  },
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated 7 August 2026",
    intro:
      "ROBOTAT is operated by NASL. This policy describes exactly what we store when you use the website or the app, why, and how to have it removed.",
    collectHeading: "What we store",
    collectAccount:
      "Your account: name, email address, the language you chose, and a one-way hash of your password. We never store the password itself. Alongside it we keep what the account needs to work — whether your email is confirmed, and single-use codes for confirming it or resetting your password, which are themselves stored as hashes.",
    collectBooking:
      "Your site assessment requests: name, email, phone number, company, land size, location, and whatever you write in the message field.",
    collectSession:
      "A cookie that keeps you signed in, and a record of that session on our server so signing out ends it everywhere.",
    collectUsage:
      "Usage events: which pages were opened, and whether a booking was started or finished. These carry a random id kept in your browser rather than your name — it links your own visits to each other and stays until you clear your browser data. They stop being connected to your account when you delete it.",
    collectPush:
      "If you use the iOS app and allow notifications, a device token so we can tell you when your assessment is scheduled.",
    useHeading: "What we do with it",
    useBody:
      "We use it to arrange and carry out your site assessment, and to contact you about it by email and WhatsApp. We do not sell it, and we do not use it for advertising.",
    shareHeading: "Who else sees it",
    shareBody:
      "Our email provider, to deliver messages to you. Meta, whenever we send you a WhatsApp message about your booking — that includes your phone number, and it happens whether or not you started the conversation. Apple, to deliver push notifications to your device. Nobody else.",
    retainHeading: "How long we keep it",
    retainBody:
      "Your account for as long as you have one. Records of assessments we actually carried out are kept as a business record, with your name and contact details removed, after you delete your account.",
    rightsHeading: "Removing your data",
    rightsBody:
      "You can delete your account at any time from the Account page in the app. That removes your account and strips your name, email, phone number and notes from past assessments.",
    contactHeading: "Contact",
    contactBody: "Questions about this policy: info@nasl-tech.com",
  },
  support: {
    title: "Support",
    intro:
      "Something not working, or a question about a booking? Reach us either way below — a real person answers both.",
    hours: "We reply within one business day, Sunday to Thursday.",

    whatsapp: "WhatsApp",
    whatsappSub: "Fastest — reply in your chats",
    email: "Email",
    emailSub: "Reply in your inbox",
    emailCopy: "Or write to us directly at",

    faqHeading: "Common questions",
    faq: [
      {
        q: "How do I book a site assessment?",
        a: "Tap Book a site assessment on the home screen, tell us how to reach you, and an agronomist arranges a visit to your land. You do not need an account to ask — but with one you can follow what happens next.",
      },
      {
        q: "Where do I see the status of my booking?",
        a: "Sign in and open your dashboard. Each request shows whether it is pending, scheduled, completed or cancelled, along with the date once we have set one.",
      },
      {
        q: "Will I be told when something changes?",
        a: "Yes. We email you whenever the status of a request changes, and if you allowed notifications on your iPhone, the app tells you too.",
      },
      {
        q: "I forgot my password.",
        a: "Choose Forgot your password? on the sign-in screen. We send a single-use link to your email address; it stops working once used.",
      },
      {
        q: "My confirmation email never arrived.",
        a: "Check the spam folder first — confirmation mail often lands there. If it is not there, write to us and we will confirm the address by hand.",
      },
      {
        q: "How do I delete my account?",
        a: "Open the Account page and choose to delete it. That removes your account and strips your name, email, phone number and notes from past assessments. The privacy policy sets out exactly what is kept and why.",
      },
    ],

    privacyHeading: "Your data",
    privacyBody:
      "What we store, who else sees it, and how to have it removed is set out in full in the privacy policy.",
    privacyLink: "Read the privacy policy",
  },
  status: {
    all: "All",
    pending: "Pending",
    scheduled: "Scheduled",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  fields: {
    email: "Email",
    phone: "Phone",
    company: "Company",
    location: "Location",
    landSize: "Land size",
    message: "Message",
  },
  /*
    Form hints. `email` and `mapsLink` stay Latin in both languages: they are examples of
    the FORMAT the field accepts, not prose, and an Arabic-script example address would
    misrepresent what you can actually type in.
  */
  placeholder: {
    email: "you@example.com",
    fullName: "Your full name",
    landSize: "e.g. 50",
    mapsLink: "https://maps.app.goo.gl/…",
  },
  services: {
    endToEnd: "End-to-End",
    autonomyServices: "Autonomy Services",
    sub: "From initial setup to ongoing optimization, NASL provides a comprehensive service wrapper around the ROBOTAT platform.",
    requestService: "Request Service",
    ctaTitle: "Ready to transform your operations?",
    ctaSub: "Our robotics experts are ready to evaluate your farm's needs and design a custom deployment strategy.",
    contactSales: "Contact Sales",
    items: [
      {
        title: "Cutting Grass",
        description: "Low-profile autonomous mowing for orchards, vineyards, and large estates. Maintains perfect turf height without manual labor.",
      },
      {
        title: "Spraying Fertilizer and Compost",
        description: "Precision application of liquid nutrients and compost tea. Reduces waste and ensures every plant gets exactly what it needs.",
      },
      {
        title: "Cultivate Your Land",
        description: "Smart soil preparation and weeding. Our robots adapt to soil conditions to create the ideal environment for your crops.",
      },
      {
        title: "Schedule a Maintenance",
        description: "AI-driven diagnostics predict hardware needs before they fail, keeping your fleet operational.",
      },
    ],
  },
  dashboard: {
    greeting: "Hi, {name}",
    subtitle: "Book and track your ROBOTAT site assessments.",
    signOut: "Sign out",
    totalRequests: "Total requests",
    awaitingScheduling: "Awaiting scheduling",
    account: "Account",
    myAssessments: "My assessments",
    book: "Book",
    assessment: "Assessment",
    siteVisit: "Site visit",
    noAssessments: "No assessments yet",
    noAssessmentsSub: "Book your first site assessment and it will show up here.",
    bookAssessment: "Book a site assessment",
    quickActions: "Quick actions",
    accountSettings: "Account settings",
    browseProducts: "Browse products",
  },
  admin: {
    assessments: "Assessments",
    manageBookings: "Manage every site-assessment booking.",
    analytics: "Analytics",
    requested: "Requested {date}",
    statusLabel: "Status",
    scheduledVisit: "Scheduled visit",
    update: "Update",
    noBookings: "No bookings",
    bookingsAppear: "Bookings will appear here as customers request assessments.",
    tabBookings: "Bookings",
    tabUsers: "Users",
    manageUsers: "Everyone who has registered an account.",
    joined: "Joined {date}",
    bookingsCount: "{count} bookings",
    oneBooking: "1 booking",
    noBookingsYet: "No bookings yet",
    verified: "Verified",
    unverified: "Unverified",
    roleStaff: "Staff",
    roleCustomer: "Customer",
    noUsers: "No accounts yet",
    usersAppear: "Accounts will appear here as people register.",
  },
  adminAnalytics: {
    title: "Analytics",
    backToAssessments: "Back to assessments",
    pageViews: "Page views",
    uniqueVisitors: "Unique visitors",
    topPages: "Top pages",
    noViews: "No views yet.",
    bookingFunnel: "Booking funnel",
    openedBooking: "Opened booking",
    choseWhatsapp: "Chose WhatsApp",
    choseEmail: "Chose Email",
    submittedRequest: "Submitted request",
    bookingSources: "Where bookings start",
    bookingSourcesSub: "Which button opened the booking form.",
    noSources: "No bookings opened yet.",
    srcHomeHero: "Home — hero button",
    srcHomeCta: "Home — closing call to action",
    srcServicesCard: "Services — service card",
    srcServicesCta: "Services — closing call to action",
    srcFleetProduct: "Fleet — robot detail",
    srcFleetPlatform: "Fleet — command centre",
    srcDashboardHeader: "Dashboard — header button",
    srcDashboardEmpty: "Dashboard — empty state",
    srcDashboardQuick: "Dashboard — quick actions",
    srcNavHeader: "Navigation — desktop header",
    srcNavMenu: "Navigation — mobile menu",
    srcTabbarContact: "Bottom bar — Contact",
    // Recorded before the source was tracked (migration 0015). Shrinks as a share of the
    // total from then on; it will never reach zero, because the old rows stay.
    srcUnknown: "Before tracking",
    emptyTitle: "No activity recorded yet",
    emptyBody: "Analytics will appear once visitors start using the site.",
    privacyNote: "First-party, anonymous analytics — no third-party trackers, no IP addresses stored.",
  },
  detail: {
    backToDashboard: "Back to dashboard",
    assessment: "Assessment",
    requested: "Requested {date}",
    cancelledMsg: "This assessment was cancelled.",
    stepRequested: "Requested",
    stepScheduled: "Scheduled",
    stepCompleted: "Completed",
    scheduledVisit: "Scheduled visit",
    notFound: "Assessment not found",
    notFoundBody: "This booking doesn't exist, or it isn't on your account.",
  },
  profile: {
    accountSettings: "Account settings",
    backToDashboard: "Back to dashboard",
    profile: "Profile",
    email: "Email",
    fullName: "Full name",
    saveChanges: "Save changes",
    changePassword: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    newPasswordHint: "At least 8 characters",
    updatePassword: "Update password",
    deleteTitle: "Delete your account",
    deleteBody: "This removes your account and personal details immediately. It cannot be undone.",
    deleteBookingsNote:
      "Assessments you have already booked stay with our team as a record of the work, with your personal details removed. Messages already sent by WhatsApp or email cannot be recalled.",
    deletePasswordLabel: "Confirm your password",
    deleteConfirm: "Delete my account",
    deleteFailed: "Couldn't delete your account",
    deleteWrongPassword: "That password is not correct.",
  },
  fleet: {
    ourProducts: "Our products",
    onePlatform: "One platform.",
    unlimitedAttachments: "Unlimited attachments",
    sub: "From agriculture to solar farms — meet the MAX T100 and its specialized ecosystem of attachments. One heavy-duty autonomous base, every job in the field.",
    basePlatform: "Base Platform",
    attachmentTool: "Attachment Tool",
    viewDetails: "View Details",
    details: "Details",
    bookDemo: "Book a Demo",
    commandCenter: "Command Center",
    commandCenterDesc:
      "Control the entire fleet from your tablet or desktop. Set boundaries, assign tasks, monitor live camera feeds, and review coverage maps all from one beautiful, intuitive interface.",
    requestPlatformDemo: "Request Platform Demo",
    emptyTitle: "No products to show yet",
    emptyBody: "Our catalogue is being updated. Please check back shortly.",
  },
  notFound: {
    title: "This page doesn't exist",
    body: "The link may be out of date, or the page may have moved. Everything else is still where you left it.",
    backHome: "Back to home",
  },
  /*
    Toasts raised from the data hooks — the `use-…` module under each feature.

    `shared` is the copy for statuses that mean the same thing wherever they occur, so
    six operations point at one string instead of carrying six identical ones; a block
    below overrides it only where its endpoint gives that status a specific meaning
    (400 on reset-password is a dead link, not a malformed field). The hooks map status
    codes to these keys — see lib/api-error.ts for why status and not the server's prose.
  */
  toast: {
    shared: {
      invalid: "Please check the details and try again.",
      signedOut: "You must be signed in to do that.",
      staffOnly: "Staff access required.",
      rateLimited: "Too many attempts. Please try again in a few minutes.",
      generic: "Something went wrong. Please try again.",
    },
    register: {
      successTitle: "Welcome to ROBOTAT",
      successBody: "Your account is ready.",
      createdTitle: "Account created",
      createdBody: "Your account was created, but signing in failed. Please sign in.",
      failedTitle: "Sign up failed",
      emailTaken:
        "An account already uses this email address. Sign in instead, or register with a different email.",
    },
    login: {
      successTitle: "Signed in",
      successBody: "Welcome back, {name}.",
      failedTitle: "Sign in failed",
      badCredentials: "Invalid email or password.",
    },
    profile: {
      successTitle: "Profile updated",
      failedTitle: "Update failed",
    },
    forgotPassword: {
      failedTitle: "Something went wrong",
    },
    resetPassword: {
      successTitle: "Password updated",
      successBody: "You can now sign in with your new password.",
      failedTitle: "Couldn't reset password",
      badLink: "This reset link is invalid or has expired.",
    },
    verification: {
      sentTitle: "Verification email sent",
      sentBody: "Check your inbox for the confirmation link.",
      alreadyTitle: "Already verified",
      alreadyBody: "Your email is already confirmed.",
      failedTitle: "Couldn't resend",
    },
    changePassword: {
      successTitle: "Password changed",
      successBody: "Your password has been updated.",
      failedTitle: "Couldn't change password",
      wrongCurrent: "Current password is incorrect.",
    },
    booking: {
      successTitle: "Assessment requested",
      successBody: "Our agronomy team will reach out to schedule your visit.",
      failedTitle: "Booking failed",
      limitReached:
        "You can book up to {limit} site assessments a day. Please try again tomorrow, or reply to one of your existing requests.",
      confirmEmailFirst:
        "Confirm your email address first — we sent you a 6-digit code. Open your dashboard to enter it.",
    },
    adminUpdate: {
      successTitle: "Updated",
      successBody: "The booking was updated.",
      failedTitle: "Update failed",
      notFound: "That booking no longer exists.",
    },
  },
  // Shared by every screen that renders a fetched list — see components/QueryState.tsx.
  state: {
    loading: "Loading",
    errorTitle: "We couldn't load this",
    errorBody: "Something went wrong reaching our servers. Check your connection and try again.",
    retry: "Try again",
    offlineTitle: "You're offline",
    offlineBody: "This needs a connection. It'll load as soon as you're back online.",
  },
  lang: { en: "EN", ar: "ع" },
};

export type Dictionary = typeof en;
