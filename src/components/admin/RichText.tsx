"use client";

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { IconBold, IconItalic, IconList, IconListNumbers, IconLink } from "@tabler/icons-react";

export interface MentionUser {
    id: string;
    name: string;
}

export interface RichTextMentionHandle {
    insertMention: (user: MentionUser) => void;
}

interface RichTextProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    readOnly?: boolean;
    compactLists?: boolean;
    autoFocus?: boolean;
    /** When true, the editor fills available height (use inside a flex container with minHeight: 0). */
    fillHeight?: boolean;
    /** Called when user types @; parent can show mention dropdown. Query is the text after @. */
    onMentionTrigger?: (query: string) => void;
}

function getTextAndMentionStart(editor: HTMLElement): { text: string; startNode: Node | null; startOffset: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = document.createRange();
    range.setStart(editor, 0);
    range.setEnd(sel.anchorNode!, sel.anchorOffset);
    const text = range.toString();
    const lastAt = text.lastIndexOf("@");
    if (lastAt === -1) return null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
    let count = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const len = (node.textContent || "").length;
        if (count + len >= lastAt) {
            startNode = node;
            startOffset = lastAt - count;
            break;
        }
        count += len;
    }
    if (startNode === null) startNode = editor.firstChild || editor;
    return { text: text.slice(lastAt + 1), startNode, startOffset };
}

const RichTextInner = forwardRef<RichTextMentionHandle, RichTextProps>(function RichTextInner(
    { value, onChange, placeholder, rows = 6, readOnly = false, compactLists = false, autoFocus = false, fillHeight = false, onMentionTrigger },
    ref
) {
    const editorRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);
    const savedSelectionRef = useRef<Range | null>(null);
    const mentionStartRef = useRef<{ node: Node; offset: number } | null>(null);

    useImperativeHandle(ref, () => ({
        insertMention(user: MentionUser) {
            const editor = editorRef.current;
            if (!editor) return;
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const start = mentionStartRef.current;
            if (!start) return;
            const range = document.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(sel.anchorNode!, sel.anchorOffset);
            const span = document.createElement("span");
            span.setAttribute("data-mention-user-id", user.id);
            span.setAttribute("class", "mention");
            span.setAttribute("contenteditable", "false");
            span.textContent = `@${user.name}`;
            range.deleteContents();
            range.insertNode(span);
            range.setStartAfter(span);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            mentionStartRef.current = null;
            if (editorRef.current) onChange(editorRef.current.innerHTML);
        },
    }), [onChange]);

    const checkMentionTrigger = useCallback(() => {
        const editor = editorRef.current;
        if (!editor || !onMentionTrigger) return;
        const info = getTextAndMentionStart(editor);
        if (!info || info.startNode === null) return;
        mentionStartRef.current = { node: info.startNode, offset: info.startOffset };
        onMentionTrigger(info.text);
    }, [onMentionTrigger]);

    useEffect(() => {
        if (editorRef.current && !isFocused) {
            editorRef.current.innerHTML = value || "";
        }
    }, [value, isFocused, compactLists]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const updatePlaceholder = () => {
            if (editor.innerHTML === "" || editor.innerHTML === "<br>") {
                editor.classList.add("empty");
            } else {
                editor.classList.remove("empty");
            }
        };

        updatePlaceholder();
        const observer = new MutationObserver(updatePlaceholder);
        observer.observe(editor, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [compactLists]);

    // Auto-focus when autoFocus prop is true
    useEffect(() => {
        if (autoFocus && editorRef.current && !readOnly) {
            // Small delay to ensure the element is fully rendered
            const timer = setTimeout(() => {
                editorRef.current?.focus();
                // Place cursor at the end of content
                const range = document.createRange();
                const selection = window.getSelection();
                if (selection && editorRef.current) {
                    range.selectNodeContents(editorRef.current);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [autoFocus, readOnly]);

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
            checkMentionTrigger();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (onMentionTrigger && e.key === "@") {
            setTimeout(checkMentionTrigger, 0);
        }
    };

    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
        }
    };

    const restoreSelection = () => {
        const selection = window.getSelection();
        if (selection && savedSelectionRef.current) {
            try {
                selection.removeAllRanges();
                selection.addRange(savedSelectionRef.current);
            } catch (e) {
                // Range might be invalid, create new one at end
                const editor = editorRef.current;
                if (editor) {
                    const range = document.createRange();
                    range.selectNodeContents(editor);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
    };

    const formatText = (e: React.MouseEvent, format: string) => {
        e.preventDefault();
        e.stopPropagation();
        
        const editor = editorRef.current;
        if (!editor) return;

        // Restore saved selection or create one
        restoreSelection();
        
        // If still no selection, create one at cursor position
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            const range = document.createRange();
            if (editor.childNodes.length > 0) {
                range.selectNodeContents(editor);
                range.collapse(false);
            } else {
                range.setStart(editor, 0);
                range.setEnd(editor, 0);
            }
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
        
        // Focus the editor
        editor.focus();
        
        // Execute the command
        let command = "";
        let promptForInput = false;
        switch (format) {
            case "bold":
                command = "bold";
                break;
            case "italic":
                command = "italic";
                break;
            case "unorderedList":
                command = "insertUnorderedList";
                break;
            case "orderedList":
                command = "insertOrderedList";
                break;
            case "createLink":
                promptForInput = true;
                break;
        }
        
        if (promptForInput && format === "createLink") {
            const url = prompt("Enter URL:");
            if (url) {
                const success = document.execCommand("createLink", false, url);
                if (success) {
                    handleInput();
                }
            }
            setTimeout(() => editor.focus(), 0);
        } else if (command) {
            const success = document.execCommand(command, false);
            if (success) {
                handleInput();
            }
            // Keep focus
            setTimeout(() => editor.focus(), 0);
        }
    };

    if (readOnly) {
        const listSpacingClass = compactLists ? "[&_li]:mb-0 [&_ul]:my-0 [&_ol]:my-0 [&_li_p]:my-0 [&_li_p]:mb-0" : "[&_li]:mb-1";
        const paragraphSpacing = compactLists
            ? "[&_p]:my-0 [&_p]:mb-0 [&_p:has(>_strong:only-child)]:mt-4 [&_>*:first-child]:mt-0"
            : "[&_p]:mb-2";
        return (
            <>
                {compactLists && (
                    <style>{`.rich-text-compact-readonly p { margin: 0; }
.rich-text-compact-readonly ul, .rich-text-compact-readonly ol { margin: 0.25rem 0 0 0; }
.rich-text-compact-readonly li { margin-bottom: 0; }
.rich-text-compact-readonly p:has(> strong:only-child) { margin-top: 1rem; }
.rich-text-compact-readonly > *:first-child { margin-top: 0 !important; }`}</style>
                )}
                <div
                    className={`text-sm text-gray-700 max-w-none [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 ${listSpacingClass} ${paragraphSpacing} [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800 ${compactLists ? "rich-text-compact-readonly" : ""}`}
                    dangerouslySetInnerHTML={{ __html: value || "" }}
                    style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                    }}
                />
            </>
        );
    }

    // Track focus on container
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleFocusIn = () => {
            container.style.boxShadow = '0 0 0 2px #6366f1';
            container.style.borderColor = 'transparent';
        };
        const handleFocusOut = () => {
            container.style.boxShadow = 'none';
            container.style.borderColor = '';
        };

        container.addEventListener('focusin', handleFocusIn);
        container.addEventListener('focusout', handleFocusOut);

        return () => {
            container.removeEventListener('focusin', handleFocusIn);
            container.removeEventListener('focusout', handleFocusOut);
        };
    }, []);

    return (
        <div 
            ref={containerRef}
            className="border border-gray-300 rounded-lg"
            style={fillHeight ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}
        >
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        saveSelection();
                    }}
                    onClick={(e) => formatText(e, "bold")}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                    title="Bold (⌘B)"
                >
                    <IconBold className="w-4 h-4 text-gray-700" />
                </button>
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        saveSelection();
                    }}
                    onClick={(e) => formatText(e, "italic")}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                    title="Italic (⌘I)"
                >
                    <IconItalic className="w-4 h-4 text-gray-700" />
                </button>
                <div className="w-px h-4 bg-gray-300 mx-1" />
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        saveSelection();
                    }}
                    onClick={(e) => formatText(e, "unorderedList")}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                    title="Bullet List"
                >
                    <IconList className="w-4 h-4 text-gray-700" />
                </button>
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        saveSelection();
                    }}
                    onClick={(e) => formatText(e, "orderedList")}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                    title="Numbered List"
                >
                    <IconListNumbers className="w-4 h-4 text-gray-700" />
                </button>
                <div className="w-px h-4 bg-gray-300 mx-1" />
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        saveSelection();
                    }}
                    onClick={(e) => formatText(e, "createLink")}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                    title="Insert Link"
                >
                    <IconLink className="w-4 h-4 text-gray-700" />
                </button>
            </div>

            {/* Editor */}
            <div
                className="relative rounded-b-lg overflow-hidden"
                style={fillHeight ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}
            >
                <style>{`.rich-text-editor-content .mention,
.rich-text-editor-content span[data-mention-user-id] {
    color: var(--color-copper) !important;
    font-weight: var(--font-weight-bold) !important;
}`}</style>
                {compactLists && (
                    <style>{`.rich-text-compact-editor p { margin: 0; }
.rich-text-compact-editor ul, .rich-text-compact-editor ol { margin: 0.25rem 0 0 0; }
.rich-text-compact-editor li { margin-bottom: 0; }
.rich-text-compact-editor p:has(> strong:only-child) { margin-top: 1rem; }
.rich-text-compact-editor > *:first-child { margin-top: 0 !important; }`}</style>
                )}
                <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        setIsFocused(true);
                    }}
                    onBlur={() => setIsFocused(false)}
                    className={`rich-text-editor-content px-3 py-2 text-sm text-gray-900 min-h-[120px] focus:outline-none [&_ul]:list-disc [&_ul]:ml-4 ${compactLists ? '[&_ul]:my-0' : '[&_ul]:my-2'} [&_ol]:list-decimal [&_ol]:ml-4 ${compactLists ? '[&_ol]:my-0' : '[&_ol]:my-2'} ${compactLists ? 'rich-text-compact-editor [&_li]:mb-0 [&_li_p]:my-0 [&_li_p]:mb-0 [&_p]:my-0 [&_p]:mb-0' : '[&_li]:mb-1 [&_p]:my-1'}`}
                    style={{
                        minHeight: fillHeight ? 120 : `${rows * 20}px`,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        ...(fillHeight ? { flex: 1, overflow: 'auto' as const } : {}),
                    }}
                    suppressContentEditableWarning
                />
                {(!value || value === "" || value === "<br>") && !isFocused && (
                    <div className="absolute top-2 left-3 text-sm text-gray-400 pointer-events-none">
                        {placeholder || "Enter details..."}
                    </div>
                )}
            </div>
        </div>
    );
});

export const RichText = RichTextInner;

