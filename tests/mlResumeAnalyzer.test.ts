import { describe, expect, it } from "bun:test";
import {
  tokenizeAndExtractNgrams,
  computeTermFrequency,
  computeCosineSimilarity,
  computeJaccardSimilarity,
  estimateSelectionProbability,
} from "../src/convex/mlResumeAnalyzer";

describe("ML Resume Analyzer Engine", () => {
  it("extracts unigrams and bigrams while filtering stopwords", () => {
    const text = "Machine learning engineer with Python and PyTorch experience in deep learning";
    const { unigrams, bigrams } = tokenizeAndExtractNgrams(text);

    expect(unigrams).toContain("machine");
    expect(unigrams).toContain("learning");
    expect(unigrams).toContain("python");
    expect(unigrams).toContain("pytorch");
    expect(unigrams).not.toContain("with"); // Stopword
    expect(unigrams).not.toContain("and");  // Stopword

    expect(bigrams).toContain("machine learning");
    expect(bigrams).toContain("deep learning");
  });

  it("computes normalized term frequency", () => {
    const tokens = ["python", "pytorch", "python", "docker"];
    const tf = computeTermFrequency(tokens);

    expect(tf.get("python")).toBe(0.5);
    expect(tf.get("pytorch")).toBe(0.25);
    expect(tf.get("docker")).toBe(0.25);
  });

  it("calculates accurate cosine similarity between vector spaces", () => {
    const docA = computeTermFrequency(["python", "tensorflow", "kubernetes", "aws"]);
    const docB = computeTermFrequency(["python", "tensorflow", "pytorch", "docker"]);
    const docC = computeTermFrequency(["sales", "marketing", "budget", "crm"]);

    const simAB = computeCosineSimilarity(docA, docB);
    const simAC = computeCosineSimilarity(docA, docC);

    // Overlapping engineering skills should have much higher similarity than marketing terms
    expect(simAB).toBeGreaterThan(0.3);
    expect(simAC).toBe(0);
  });

  it("calculates Jaccard set similarity", () => {
    const setA = new Set(["python", "ml", "sql"]);
    const setB = new Set(["python", "ml", "docker", "aws"]);

    const jaccard = computeJaccardSimilarity(setA, setB);
    // Intersection: 2, Union: 5 -> 2/5 = 0.4
    expect(jaccard).toBe(0.4);
  });

  it("predicts interview callback probability via sigmoid model", () => {
    const highProb = estimateSelectionProbability(0.85, 0.9, 0.9);
    const lowProb = estimateSelectionProbability(0.1, 0.2, 0.1);

    expect(highProb).toBeGreaterThan(75);
    expect(lowProb).toBeLessThan(40);
  });
});
