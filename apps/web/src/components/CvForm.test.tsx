// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createBlankCv, type CvData } from "@nomcci/cvmaker-domain";
import { getMessages } from "../i18n/messages";
import { CvForm } from "./CvForm";

function Harness({ initial, onSnapshot }: { initial: CvData; onSnapshot: (cv: CvData) => void }) {
  const [cv, setCv] = useState(initial);
  return <CvForm cv={cv} messages={getMessages("en")} onChange={(next) => { setCv(next); onSnapshot(next); }} />;
}

describe("CvForm", () => {
  it("edits multiple experiences, skills and links", async () => {
    const user = userEvent.setup();
    let current = createBlankCv();
    render(<Harness initial={current} onSnapshot={(cv) => { current = cv; }} />);

    await user.click(screen.getByRole("button", { name: "Add experience" }));
    await user.click(screen.getByRole("button", { name: "Add experience" }));
    expect(screen.getAllByLabelText("Recent role")).toHaveLength(2);

    await user.type(screen.getAllByLabelText("Recent role")[0]!, "Engineer");
    expect(current.experience?.[0]?.role).toBe("Engineer");
    expect(current.experience?.[1]?.role).toBe("");

    await user.click(screen.getByRole("button", { name: "Add skill group" }));
    await user.type(screen.getByLabelText("Skill area"), "Programming");
    expect(current.skills?.[0]?.name).toBe("Programming");

    await user.click(screen.getByRole("button", { name: "Add link" }));
    expect(current.personal_info.links).toHaveLength(1);
  });

  it("removes entries without touching the rest", async () => {
    const user = userEvent.setup();
    let current: CvData = { ...createBlankCv(), languages: [{ name: "Spanish", level: "Native" }] };
    render(<Harness initial={current} onSnapshot={(cv) => { current = cv; }} />);

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(current.languages).toHaveLength(0);
  });
});
