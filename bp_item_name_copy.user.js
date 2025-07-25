// ==UserScript==
// @name         Copy item names from Backpack.tf in one-click
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add copy functionality for item names on backpack.tf - click titles, stats headers, and popover titles to copy item names
// @author       loz
// @match        https://backpack.tf/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // Performance tracking utilities
  const perfTracker = {
    start: (operation) => {
      if (window.BPTF_COPY_DEBUG) console.time(`BPTF-Copy: ${operation}`);
    },
    end: (operation) => {
      if (window.BPTF_COPY_DEBUG) console.timeEnd(`BPTF-Copy: ${operation}`);
    },
  };

  // WeakSets for tracking processed elements (better performance than dataset attributes)
  const processedElements = new WeakSet();
  const processedPopovers = new WeakSet();

  // Optimized selectors without :not() filters (faster queries)
  const SELECTORS = {
    bptfListings: ".listing-title h5",
    bptfStats: ".stats-header-title",
    bptfPopovers: ".popover-title",
  };

  // Cached DOM queries
  const domCache = {
    hostname: window.location.hostname,
    isBackpack: window.location.hostname.includes("backpack.tf"),
  };

  // CSS styles for clickable elements
  const STYLES = `
        /* Clickable element styles for backpack.tf */
        .tf-clickable-copy {
            cursor: pointer;
            transition: all 0.1s ease;
            position: relative;
        }
        
        .tf-clickable-copy:hover {
            opacity: 0.8;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }
        
        .tf-clickable-copy--success {
            background-color: rgba(0, 150, 0, 0.3) !important;
            transition: all 0.1s ease !important;
        }
        
        .tf-clickable-copy--error {
            background-color: rgba(150, 0, 0, 0.3) !important;
            transition: all 0.1s ease !important;
        }
    `;

  // Text cleaning utilities
  const cleanWhitespace = (text) => {
    if (!text) return "";
    return text.replace(/\s+/g, " ").trim();
  };

  // Clipboard functionality with user feedback
  const copyToClipboard = async (text) => {
    if (!text) return false;

    const cleanText = cleanWhitespace(text);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cleanText);
        return true;
      } else {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = cleanText;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textArea);
        return success;
      }
    } catch (error) {
      console.warn("BPTF-Copy: Failed to copy text:", error);
      return false;
    }
  };

  // Make an element clickable for copying
  const makeElementCopyable = (element, text, context) => {
    element.classList.add("tf-clickable-copy");
    element.dataset.copyText = text;
    element.dataset.context = context;
    element.title = "Click to copy item name";
    
    // Mark as processed
    processedElements.add(element);
  };

  // Batch processing system to avoid UI blocking
  const processBatch = (elements, handler, batchSize = 50) => {
    if (elements.length === 0) return;

    const process = (startIndex) => {
      const endIndex = Math.min(startIndex + batchSize, elements.length);

      for (let i = startIndex; i < endIndex; i++) {
        try {
          handler(elements[i]);
          processedElements.add(elements[i]);
        } catch (error) {
          console.warn(
            "BPTF-Copy: Error processing element:",
            error,
            elements[i]
          );
        }
      }

      if (endIndex < elements.length) {
        requestAnimationFrame(() => process(endIndex));
      } else {
        // Log processing stats for large operations
        if (elements.length > 50) {
          console.log(`BPTF-Copy: Processed ${elements.length} elements`);
        }
      }
    };

    requestAnimationFrame(() => process(0));
  };

  // Backpack.tf Listings handler (medium volume) - Make titles clickable
  const processBPTFListings = () => {
    perfTracker.start("BPTF Listings Processing");

    // Target the h5 title elements directly instead of button containers
    const allTitleElements = document.querySelectorAll(SELECTORS.bptfListings);
    const titleElements = Array.from(allTitleElements).filter(el => !processedElements.has(el));
    
    if (titleElements.length === 0) {
      perfTracker.end("BPTF Listings Processing");
      return;
    }

    processBatch(
      titleElements,
      (titleElement) => {
        // Extract only the first text node (the actual item name)
        let itemName = "";
        for (const node of titleElement.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = cleanWhitespace(node.textContent);
            if (text) {
              itemName = text;
              break;
            }
          }
        }

        if (!itemName) return;

        // Make the entire title element clickable for copying
        makeElementCopyable(titleElement, itemName, "listing-title");
      },
      50
    );

    perfTracker.end("BPTF Listings Processing");
  };

  // Backpack.tf Stats page handler - Make title clickable
  const processBPTFStats = () => {
    const statsTitle = document.querySelector(SELECTORS.bptfStats);
    if (!statsTitle || processedElements.has(statsTitle)) return;

    const itemName = cleanWhitespace(statsTitle.textContent);
    if (!itemName) return;

    // Make the entire stats title clickable for copying
    makeElementCopyable(statsTitle, itemName, "stats-title");
  };

  // Backpack.tf Popovers handler - Make popover titles clickable (optimized for hover)
  const processBPTFPopovers = () => {
    // Process all popovers, not just visible ones
    const allPopovers = document.querySelectorAll('.popover');
    
    for (const popover of allPopovers) {
      if (processedPopovers.has(popover)) continue;
      
      const titleElement = popover.querySelector(SELECTORS.bptfPopovers);
      if (!titleElement || processedElements.has(titleElement)) continue;

      const itemName = cleanWhitespace(titleElement.textContent);
      if (!itemName) continue;

      // Make the entire popover title clickable for copying
      makeElementCopyable(titleElement, itemName, "popover-title");
      
      // Mark popover as processed to avoid reprocessing
      processedPopovers.add(popover);
    }

    // Clean up popovers that are no longer visible (WeakSet automatically handles cleanup)
  };

  // Main processing function
  const processAllElements = () => {
    if (domCache.isBackpack) {
      processBPTFListings();
      processBPTFStats();
      processBPTFPopovers();
    }
  };

  // Optimized mutation observer with debouncing
  let mutationTimeout;
  const debouncedProcess = () => {
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(processAllElements, 100); // 100ms debounce
  };

  const setupMutationObserver = () => {
    // Pre-compile relevant selectors for better performance
    const relevantSelectors = ".listing-title h5, .stats-header-title";
    const popoverSelector = '.popover';
    
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      let hasPopoverChanges = false;
      
      // Batch process mutations for better performance
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue; // Only element nodes

            // Check for popover-specific changes
            if (node.matches && node.matches(popoverSelector)) {
              hasPopoverChanges = true;
              shouldProcess = true;
              break;
            }

            // Check for other relevant nodes
            if (node.matches && 
                (node.matches(relevantSelectors) || 
                 node.querySelector(relevantSelectors + ", " + popoverSelector))) {
              shouldProcess = true;
            }
          }
        }

        // Check for class changes on popovers (for .in class)
        if (mutation.type === 'attributes' && 
            mutation.attributeName === 'class' && 
            mutation.target.classList.contains('popover')) {
          hasPopoverChanges = true;
          shouldProcess = true;
        }
        
        // Early exit if we already know we need to process
        if (shouldProcess && hasPopoverChanges) break;
      }

      if (shouldProcess) {
        // For popover changes, process immediately without debouncing
        if (hasPopoverChanges && domCache.isBackpack) {
          processBPTFPopovers();
        } else {
          debouncedProcess();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'], // Only watch class changes for popovers
    });

    return observer;
  };

  // Inject CSS styles
  const injectStyles = () => {
    const styleElement = document.createElement("style");
    styleElement.textContent = STYLES;
    document.head.appendChild(styleElement);
  };

  // Global event delegation for all copy actions
  const setupEventDelegation = () => {
    // Track feedback timeouts to prevent spam
    const feedbackTimeouts = new WeakMap();

    document.addEventListener('click', async (e) => {
      const target = e.target.closest('.tf-clickable-copy');
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();

      const copyText = target.dataset.copyText;
      const context = target.dataset.context;
      if (!copyText) return;

      // Prevent spam clicking
      if (feedbackTimeouts.has(target)) return;

      // Force blur to remove hover state
      target.blur();

      const success = await copyToClipboard(copyText);

      // Clickable element feedback
      const originalClasses = target.className;
      
      if (success) {
        target.classList.add('tf-clickable-copy--success');
      } else {
        target.classList.add('tf-clickable-copy--error');
      }

      const timeout = setTimeout(() => {
        target.className = originalClasses;
        feedbackTimeouts.delete(target);
      }, 400);
      feedbackTimeouts.set(target, timeout);
    });
  };

  // Staggered initialization for optimal performance
  const initialize = () => {
    perfTracker.start("Total Initialization");

    // Inject styles first
    injectStyles();

    // Setup global event delegation
    setupEventDelegation();

    // Process immediately visible elements first
    processAllElements();

    // Setup mutation observer for dynamic content
    setupMutationObserver();

    perfTracker.end("Total Initialization");

    console.log("BPTF-Copy: Initialized successfully");
    console.log(
      "BPTF-Copy: Set window.BPTF_COPY_DEBUG = true for performance logs"
    );
  };

  // Start when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
