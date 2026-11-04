/**
 * Server-known spoken system messages.
 *
 * The `speak` function never accepts client text. Completion and confirmation messages are
 * therefore identified by a fixed id from this allowlist, exactly like adaptive questions
 * are identified by a question id. The wording is owner-approved (4 Nov 2026) and is
 * rendered on screen at the same time, so the spoken and visible content cannot diverge.
 */

export type SystemMessageId = "complete_intake" | "report_ready" | "report_sent";

export interface SystemMessageText {
  en: string;
  hi: string;
}

export const SYSTEM_MESSAGES: Readonly<Record<SystemMessageId, SystemMessageText>> = {
  complete_intake: {
    en: "Thank you for sharing all this information. I've organized your responses into a pre-visit summary for your doctor. Please review the report below. Once you're ready, you can send it to your doctor and book an available appointment.",
    hi: "आपने अपनी स्वास्थ्य संबंधी जानकारी साझा की, इसके लिए धन्यवाद। मैंने आपके उत्तरों को डॉक्टर से मुलाक़ात से पहले देखने के लिए एक सारांश में व्यवस्थित किया है। कृपया इसे ध्यान से देख लें। इसके बाद आप इसे अपने डॉक्टर को भेज सकते हैं और उपलब्ध समय के अनुसार अपॉइंटमेंट बुक कर सकते हैं।",
  },
  report_ready: {
    en: "Your pre-visit summary is ready. Please review it and select Send to Doctor when you're ready.",
    hi: "आपका प्री-विज़िट सारांश तैयार है। कृपया इसे देखें और जब आप तैयार हों, तब डॉक्टर को भेजें।",
  },
  report_sent: {
    en: "Your report has been successfully sent to your doctor. You can now book an available appointment.",
    hi: "आपकी रिपोर्ट सफलतापूर्वक डॉक्टर को भेज दी गई है। अब आप उपलब्ध समय के अनुसार अपॉइंटमेंट बुक कर सकते हैं।",
  },
};

export const SYSTEM_MESSAGE_IDS: readonly SystemMessageId[] = Object.keys(SYSTEM_MESSAGES) as SystemMessageId[];

export function isSystemMessageId(value: unknown): value is SystemMessageId {
  return typeof value === "string" && (SYSTEM_MESSAGE_IDS as readonly string[]).includes(value);
}

export function systemMessageText(id: SystemMessageId, language: "en" | "hi"): string {
  return SYSTEM_MESSAGES[id][language];
}
