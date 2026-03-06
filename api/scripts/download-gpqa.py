#!/usr/bin/env python3
"""
TASK-B1: Download GPQA Diamond dataset from HuggingFace

Downloads the GPQA Diamond split (448 PhD-level science questions) and converts to JSONL format.
Starts with 50-question sample for validation.

Source: https://huggingface.co/datasets/Idavidrein/gpqa
Paper: https://arxiv.org/abs/2311.12022

Usage:
    python3 api/scripts/download-gpqa.py --sample 50  # Download 50-question sample
    python3 api/scripts/download-gpqa.py              # Download full 448 questions
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from datasets import load_dataset
except ImportError:
    print("❌ Error: 'datasets' library not installed")
    print("Install with: pip install datasets")
    sys.exit(1)

def download_gpqa_diamond(output_dir: Path, sample_size: int = None):
    """
    Download GPQA Diamond dataset and convert to JSONL format.

    Args:
        output_dir: Directory to save the JSONL file
        sample_size: If specified, only download first N questions (for validation)
    """
    print("=== TASK-B1: GPQA Diamond Download ===\n")
    print(f"Loading GPQA Diamond from HuggingFace...")

    try:
        # Load the diamond split from HuggingFace
        dataset = load_dataset("Idavidrein/gpqa", "gpqa_diamond", split="train")

        total_questions = len(dataset)
        print(f"✅ Loaded {total_questions} questions from GPQA Diamond\n")

    except Exception as e:
        print(f"❌ Failed to load dataset: {e}")
        print("\nNote: Some GPQA versions may require HuggingFace authentication or access approval.")
        print("If this fails, you may need to:")
        print("  1. Create a HuggingFace account")
        print("  2. Accept the dataset license at https://huggingface.co/datasets/Idavidrein/gpqa")
        print("  3. Set HF_TOKEN environment variable with your HuggingFace token")
        sys.exit(1)

    # Limit to sample if specified
    if sample_size and sample_size < total_questions:
        dataset = dataset.select(range(sample_size))
        output_filename = f"gpqa_diamond_{sample_size}.jsonl"
        print(f"Sampling first {sample_size} questions for validation\n")
    else:
        output_filename = "gpqa_diamond.jsonl"
        print(f"Using full dataset ({total_questions} questions)\n")

    output_path = output_dir / output_filename
    output_dir.mkdir(parents=True, exist_ok=True)

    # Convert to JSONL format
    converted_count = 0
    skipped_count = 0

    with open(output_path, 'w', encoding='utf-8') as f:
        for idx, item in enumerate(dataset):
            try:
                # GPQA format has: question, choices (list of 4 options), answer (index 0-3)
                question_text = item.get('Question') or item.get('question', '')
                choices = item.get('Choices') or item.get('choices', [])
                correct_index = item.get('Answer') or item.get('answer', 0)

                # Convert answer index to letter (0 → A, 1 → B, etc.)
                answer_letter = chr(65 + int(correct_index))  # 65 is ASCII for 'A'

                # Format options as "(A) text (B) text (C) text (D) text"
                options_text = ' '.join([f"({chr(65 + i)}) {choice}" for i, choice in enumerate(choices)])

                # Append options to question text (for MC grading with option-text fallback)
                full_question = f"{question_text}\n\n{options_text}"

                # Extract category/subject if available
                category = item.get('Subdomain') or item.get('subdomain') or item.get('category', 'unknown')

                record = {
                    "id": f"gpqa_{idx + 1:03d}",
                    "question": full_question,
                    "answer": answer_letter,
                    "category": category.lower(),
                    "type": "factual",  # GPQA is factual knowledge testing
                    "options": [f"({chr(65 + i)}) {choice}" for i, choice in enumerate(choices)]
                }

                f.write(json.dumps(record, ensure_ascii=False) + '\n')
                converted_count += 1

            except Exception as e:
                print(f"⚠️  Skipped question {idx + 1}: {e}")
                skipped_count += 1
                continue

    print(f"✅ Converted {converted_count} questions to JSONL format")
    if skipped_count > 0:
        print(f"⚠️  Skipped {skipped_count} questions due to format issues")
    print(f"📄 Saved to: {output_path}\n")

    # Show sample
    print("Sample question:")
    with open(output_path, 'r', encoding='utf-8') as f:
        first_line = f.readline()
        sample = json.loads(first_line)
        print(f"  ID: {sample['id']}")
        print(f"  Category: {sample['category']}")
        print(f"  Question: {sample['question'][:150]}...")
        print(f"  Answer: {sample['answer']}")
        print(f"  Options: {len(sample['options'])} choices\n")

def main():
    parser = argparse.ArgumentParser(
        description="Download GPQA Diamond dataset for Phase 2 benchmarks"
    )
    parser.add_argument(
        '--sample',
        type=int,
        default=None,
        help="Download only first N questions (default: full 448 questions)"
    )
    parser.add_argument(
        '--output-dir',
        type=Path,
        default=Path(__file__).parent.parent.parent / 'benchmarks' / 'datasets',
        help="Output directory for JSONL file (default: benchmarks/datasets/)"
    )

    args = parser.parse_args()

    download_gpqa_diamond(args.output_dir, args.sample)

    print("✅ TASK-B1 complete. Ready for grading validation.\n")

if __name__ == '__main__':
    main()
