export interface PageContext {
    pageTitle: string;
    pageUrl: string;
    domain: string;
    surroundingText: string;
    pageType: string;
    selectedText: string;
  }
  
  export interface UserPreferences {
    explanationLevel: 'beginner' | 'intermediate' | 'advanced';
    focusArea: 'general' | 'technical' | 'business' | 'academic' | 'creative';
    outputFormat: 'structured' | 'conversational' | 'bullet-points';
  }
  
  export class ContextService {
    static getContextualInfo(selectedText: string): PageContext {
      const selection = window.getSelection();
      let surroundingText = '';
  
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const blockElement = container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : container as HTMLElement;
  
        const siblingsText: string[] = [];
        if (blockElement?.parentElement) {
          const siblings = Array.from(blockElement.parentElement.children);
          const index = siblings.indexOf(blockElement);
          const contextRange = siblings.slice(Math.max(0, index - 2), index + 3);
  
          for (const el of contextRange) {
            if (el.textContent?.trim()) {
              const content = el.textContent.includes(selectedText)
                ? el.textContent.replace(
                    selectedText,
                    `[[SELECTED]]${selectedText}[[/SELECTED]]`
                  )
                : el.textContent;
              siblingsText.push(content.trim());
            }
          }
        }
        surroundingText = siblingsText.join('\n\n').substring(0, 2000);
      }
  
      return {
        pageTitle: document.title,
        pageUrl: window.location.href,
        domain: window.location.hostname,
        surroundingText,
        pageType: this.detectPageType(),
        selectedText
      };
    }
  
    private static detectPageType(): string {
      const url = window.location.href;
      const content = document.body.textContent?.toLowerCase() || '';
  
      if (url.includes('github.com') || url.includes('stackoverflow.com')) return 'technical';
      if (url.includes('wikipedia.org')) return 'encyclopedia';
      if (url.includes('news') || document.querySelector('article')) return 'article';
      if (document.querySelector('code, pre')) return 'documentation';
      if (url.includes('linkedin.com') || url.includes('business')) return 'business';
  
      return 'general';
    }
  
    static generateEnhancedAgenticPrompt(selectedText: string, context: PageContext, userPrefs?: Partial<UserPreferences>): { systemPrompt: string, userPrompt: string } {
      const prefs: UserPreferences = {
        explanationLevel: 'intermediate',
        focusArea: 'general',
        outputFormat: 'structured',
        ...userPrefs
      };
  
      const systemPrompt = `
  You are an advanced, context-aware AI assistant embedded in a browser extension. Your primary goal is to help the user understand a selected text segment in depth by leveraging the full context of the webpage.
  
  You are capable of reading complex, domain-specific web content — including technical documentation, legal texts, and code snippets — and transforming it into structured, insightful explanations.
  
  You receive:
  - A user-selected text segment (explicitly marked in the context as [[SELECTED]]...[[/SELECTED]])
  - Contextual text before and after the selection
  - Metadata such as page title, URL, domain, and detected content type
  - The user's intent preferences (e.g., explanation depth, tone, focus area)
  
  You should:
  - Prioritize clarity and relevance
  - Be proactive: infer relationships, clarify ambiguity, and surface hidden implications
  - Adjust tone and complexity to the user's specified expertise level
  - Use structured output (headings, bullet points, code blocks, etc.)
  - Highlight key insights, terms, and connections to broader topics
  
  If the selection is ambiguous or incomplete, infer possible interpretations based on the surrounding text.
  
  Act like a domain-aware mentor who guides with precision, context, and intent-driven understanding.
      `.trim();
  
      let levelInstruction = '';
      switch (prefs.explanationLevel) {
        case 'beginner':
          levelInstruction = 'Explain as if I\'m new to this topic. Use simple language and provide background context.';
          break;
        case 'advanced':
          levelInstruction = 'Provide a detailed, technical explanation. Assume I have relevant background knowledge.';
          break;
        default:
          levelInstruction = 'Provide a balanced explanation with moderate technical detail.';
      }
  
      const focusAnalysis = prefs.focusArea !== 'general'
        ? `6. **${prefs.focusArea.charAt(0).toUpperCase() + prefs.focusArea.slice(1)} Perspective**: Analyze from a ${prefs.focusArea} viewpoint`
        : '';
  
      const userPrompt = `
  **Contextual Snapshot:**
  - Page: ${context.pageTitle} (${context.domain})
  - Type: ${context.pageType}
  - Contextual Excerpt (with selection marked as [[SELECTED]]...[[/SELECTED]]):
  "${context.surroundingText}"
  
  **User Preferences:**
  ${levelInstruction}
  
  **Your Tasks:**
  1. **Main Insights**: Summarize the 2–3 most important ideas in the selection
  2. **Deeper Explanation**: Explain technical or conceptual elements
  3. **Terminology**: Define specialized terms
  4. **Broader Context**: Connect the content to the larger domain
  ${focusAnalysis}
  
  Optionally suggest a follow-up question the user might ask for deeper understanding.
      `.trim();
  
      return { systemPrompt, userPrompt };
    }
  }
  