import { levelTier, shortLevel } from "./levelTier";

const four = [
    { optionCode: "L2", minScore: 40 }, { optionCode: "L4", minScore: 75 },
    { optionCode: "L1", minScore: 0 }, { optionCode: "L3", minScore: "60" },
]

test("four levels: level 4 strong, 3 good, 2 average, 1 fail, whatever order they are configured in", () => {
    expect(["L4", "L3", "L2", "L1"].map((code) => levelTier(code, four))).toEqual(["STRONG", "GOOD", "AVERAGE", "FAIL"])
})

test("other counts spread over the tiers, the lowest always failing", () => {
    const three = [{ optionCode: "A", minScore: 0 }, { optionCode: "B", minScore: 50 }, { optionCode: "C", minScore: 80 }]
    expect(["C", "B", "A"].map((code) => levelTier(code, three))).toEqual(["STRONG", "GOOD", "FAIL"])
    const five = [0, 20, 40, 60, 80].map((minScore, i) => ({ optionCode: `L${i + 1}`, minScore }))
    expect(["L5", "L4", "L3", "L2", "L1"].map((code) => levelTier(code, five))).toEqual(["STRONG", "STRONG", "GOOD", "AVERAGE", "FAIL"])
})

test("an unknown or missing level has no tier", () => {
    expect(levelTier("L9", four)).toBeUndefined()
    expect(levelTier(undefined, four)).toBeUndefined()
})

test("the chip shows the level's number, from its name or its code", () => {
    expect(shortLevel("Level 4 - Strong pass", "L4")).toBe("4")
    expect(shortLevel("Strong pass", "L4")).toBe("4")
    expect(shortLevel("Strong pass", "SP")).toBe("SP")
    expect(shortLevel("Strong pass")).toBe("Strong pass")
})
