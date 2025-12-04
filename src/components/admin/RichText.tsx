"use client";

import { useState, useRef, useEffect } from "react";
import { IconBold, IconItalic, IconList, IconListNumbers, IconLink } from "@tabler/icons-react";

interface RichTextProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    readOnly?: boolean;
}

export function RichText({ value, onChange, placeholder, rows = 6, readOnly = false }: RichTextProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);
    const savedSelectionRef = useRef<Range | null>(null);

    useEffect(() => {
        if (editorRef.current && !isFocused) {
            editorRef.current.innerHTML = value || "";
        }
    }, [value, isFocused]);

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
    }, []);

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
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
        return (
            <div
                className="text-sm text-gray-700 max-w-none [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-1 [&_p]:mb-2 [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800"
                dangerouslySetInnerHTML={{ __html: value || "" }}
                style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                }}
            />
        );
    }

    return (
        <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent">
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border-b border-gray-200">
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
            <div className="relative">
                <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className="px-3 py-2 text-sm text-gray-900 min-h-[120px] focus:outline-none [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2 [&_li]:mb-1 [&_p]:my-1"
                    style={{
                        minHeight: `${rows * 20}px`,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
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
}

