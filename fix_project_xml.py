#!/usr/bin/env python3
"""
MS Project XML Fixer for Nusuk Platform
========================================
Parses, validates, and repairs MS Project XML files so they
can be correctly imported into the Nusuk project management platform.

Usage:
    python fix_project_xml.py input.xml [output.xml]

If output.xml is omitted, defaults to fixed_project.xml
"""

import sys
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from copy import deepcopy

# MS Project XML namespace
MS_NS = "http://schemas.microsoft.com/project"
NS = {"ms": MS_NS}

# Default working hours (Saudi standard: 9am-5pm = 8 hours/day)
WORK_HOURS_PER_DAY = 8
DEFAULT_START_TIME = "T08:00:00"
DEFAULT_FINISH_TIME = "T17:00:00"


def strip_namespace(tag: str) -> str:
    """Remove namespace prefix from tag: {http://...}Name -> Name"""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def find_elem(parent: ET.Element, tag: str) -> ET.Element | None:
    """Find element by local name, namespace-agnostic."""
    # Try with namespace first
    elem = parent.find(f"ms:{tag}", NS)
    if elem is not None:
        return elem
    # Try without namespace
    elem = parent.find(tag)
    if elem is not None:
        return elem
    # Try any namespace
    for child in parent:
        if strip_namespace(child.tag) == tag:
            return child
    return None


def find_all_elems(parent: ET.Element, tag: str) -> list[ET.Element]:
    """Find all elements by local name, namespace-agnostic."""
    results = []
    # Try with namespace
    results = parent.findall(f"ms:{tag}", NS)
    if results:
        return results
    # Try without namespace
    results = parent.findall(tag)
    if results:
        return results
    # Try any namespace
    for child in parent:
        if strip_namespace(child.tag) == tag:
            results.append(child)
    return results


def get_text(parent: ET.Element, tag: str, default: str = "") -> str:
    """Get text content of a child element."""
    elem = find_elem(parent, tag)
    if elem is not None and elem.text:
        return elem.text.strip()
    return default


def parse_duration_to_hours(duration_str: str) -> float:
    """Parse MS Project duration format PT{H}H{M}M{S}S to hours."""
    if not duration_str:
        return 0
    hours = 0.0
    h_match = re.search(r"(\d+)H", duration_str)
    m_match = re.search(r"(\d+)M", duration_str)
    s_match = re.search(r"(\d+)S", duration_str)
    if h_match:
        hours += int(h_match.group(1))
    if m_match:
        hours += int(m_match.group(1)) / 60
    if s_match:
        hours += int(s_match.group(1)) / 3600
    return hours


def hours_to_duration_str(hours: float) -> str:
    """Convert hours to MS Project duration format."""
    h = int(hours)
    m = int((hours - h) * 60)
    return f"PT{h}H{m}M0S"


def hours_to_days(hours: float) -> float:
    """Convert working hours to working days."""
    return hours / WORK_HOURS_PER_DAY if WORK_HOURS_PER_DAY else 0


def parse_date(date_str: str) -> datetime | None:
    """Parse various date formats from MS Project XML."""
    if not date_str:
        return None
    # Remove timezone info for simplicity
    date_str = date_str.replace("Z", "").strip()
    for fmt in [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%d",
        "%Y/%m/%d",
    ]:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def format_date(dt: datetime) -> str:
    """Format datetime to MS Project format."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def add_working_days(start: datetime, days: float) -> datetime:
    """Add working days to a date (skip Fri/Sat for Saudi calendar)."""
    result = start
    remaining = days
    while remaining > 0:
        result += timedelta(days=1)
        # Saudi working days: Sun(6) Mon(0) Tue(1) Wed(2) Thu(3)
        # Skip: Fri(4) Sat(5)
        if result.weekday() not in (4, 5):
            remaining -= 1
    return result.replace(hour=17, minute=0, second=0)


class TaskData:
    """Represents a parsed task with all fields."""

    def __init__(self):
        self.uid: int = 0
        self.id: int = 0
        self.name: str = ""
        self.start: datetime | None = None
        self.finish: datetime | None = None
        self.duration_hours: float = 0
        self.outline_level: int = 1
        self.outline_number: str = ""
        self.wbs: str = ""
        self.is_milestone: bool = False
        self.is_summary: bool = False
        self.percent_complete: int = 0
        self.priority: int = 500
        self.constraint_type: int = 0
        self.constraint_date: datetime | None = None
        self.notes: str = ""
        self.predecessors: list[dict] = []
        self.parent_uid: int | None = None
        self.is_null: bool = False
        # Tracking
        self.was_fixed: bool = False
        self.fix_notes: list[str] = []


def parse_tasks(root: ET.Element) -> tuple[list[TaskData], dict]:
    """Parse all tasks from the XML root element."""
    stats = {"total_detected": 0, "removed": 0, "fixed": 0, "reasons_removed": []}

    tasks_elem = find_elem(root, "Tasks")
    if tasks_elem is None:
        print("ERROR: No <Tasks> element found in XML!")
        return [], stats

    task_elems = find_all_elems(tasks_elem, "Task")
    stats["total_detected"] = len(task_elems)

    tasks: list[TaskData] = []
    seen_uids: set[int] = set()

    for task_elem in task_elems:
        t = TaskData()
        t.uid = int(get_text(task_elem, "UID", "0"))
        t.id = int(get_text(task_elem, "ID", "0"))
        t.name = get_text(task_elem, "Name", "")
        t.start = parse_date(get_text(task_elem, "Start"))
        t.finish = parse_date(get_text(task_elem, "Finish"))
        t.duration_hours = parse_duration_to_hours(get_text(task_elem, "Duration"))
        t.outline_level = int(get_text(task_elem, "OutlineLevel", "1"))
        t.outline_number = get_text(task_elem, "OutlineNumber", "")
        t.wbs = get_text(task_elem, "WBS", "")
        t.is_milestone = get_text(task_elem, "Milestone") == "1"
        t.is_summary = get_text(task_elem, "Summary") == "1"
        t.percent_complete = int(get_text(task_elem, "PercentComplete", "0"))
        t.priority = int(get_text(task_elem, "Priority", "500"))
        t.constraint_type = int(get_text(task_elem, "ConstraintType", "0"))
        t.constraint_date = parse_date(get_text(task_elem, "ConstraintDate"))
        t.notes = get_text(task_elem, "Notes", "")
        t.is_null = get_text(task_elem, "IsNull") == "1"

        # Parse predecessors
        for pred_elem in find_all_elems(task_elem, "PredecessorLink"):
            pred = {
                "uid": int(get_text(pred_elem, "PredecessorUID", "0")),
                "type": int(get_text(pred_elem, "Type", "1")),
                "lag": int(get_text(pred_elem, "LinkLag", "0")),
                "lag_format": int(get_text(pred_elem, "LagFormat", "7")),
            }
            t.predecessors.append(pred)

        # ── FILTER: Remove invalid tasks ──

        # 1. UID = 0 (project summary root)
        if t.uid == 0:
            stats["removed"] += 1
            stats["reasons_removed"].append(f"UID=0 (Project Summary): '{t.name}'")
            continue

        # 2. Null tasks
        if t.is_null:
            stats["removed"] += 1
            stats["reasons_removed"].append(f"IsNull=1: '{t.name}' (UID={t.uid})")
            continue

        # 3. Empty name
        if not t.name.strip():
            stats["removed"] += 1
            stats["reasons_removed"].append(f"Empty name: UID={t.uid}")
            continue

        # 4. Duplicate UID
        if t.uid in seen_uids:
            stats["removed"] += 1
            stats["reasons_removed"].append(
                f"Duplicate UID={t.uid}: '{t.name}'"
            )
            continue

        seen_uids.add(t.uid)
        tasks.append(t)

    return tasks, stats


def fix_tasks(tasks: list[TaskData], stats: dict) -> list[TaskData]:
    """Fix tasks: infer missing dates, ensure sequential IDs, etc."""
    if not tasks:
        return tasks

    # ── Fix missing dates ──
    now = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)

    for t in tasks:
        fixed = False

        # If both start and finish are missing
        if t.start is None and t.finish is None:
            if t.duration_hours > 0:
                t.start = now
                t.finish = add_working_days(now, hours_to_days(t.duration_hours))
                t.fix_notes.append("Inferred start/finish from duration")
            elif t.is_milestone:
                t.start = now
                t.finish = now
                t.duration_hours = 0
                t.fix_notes.append("Milestone: set to today")
            else:
                t.start = now
                t.finish = add_working_days(now, 1)
                t.duration_hours = WORK_HOURS_PER_DAY
                t.fix_notes.append("No dates/duration: defaulted to 1 day")
            fixed = True

        # If only start is missing
        elif t.start is None and t.finish is not None:
            if t.duration_hours > 0:
                days = hours_to_days(t.duration_hours)
                t.start = t.finish - timedelta(days=max(1, int(days)))
                t.start = t.start.replace(hour=8, minute=0, second=0)
            else:
                t.start = t.finish.replace(hour=8, minute=0, second=0)
            t.fix_notes.append("Inferred start from finish + duration")
            fixed = True

        # If only finish is missing
        elif t.start is not None and t.finish is None:
            if t.duration_hours > 0:
                t.finish = add_working_days(t.start, hours_to_days(t.duration_hours))
            else:
                t.finish = t.start.replace(hour=17, minute=0, second=0)
                t.duration_hours = WORK_HOURS_PER_DAY
            t.fix_notes.append("Inferred finish from start + duration")
            fixed = True

        # If duration is 0 but not a milestone and has date range
        if (
            t.duration_hours <= 0
            and not t.is_milestone
            and t.start
            and t.finish
            and t.start != t.finish
        ):
            diff_days = (t.finish - t.start).days
            if diff_days > 0:
                t.duration_hours = diff_days * WORK_HOURS_PER_DAY
                t.fix_notes.append(f"Computed duration: {diff_days} days")
                fixed = True

        # Ensure finish >= start
        if t.start and t.finish and t.finish < t.start:
            t.finish, t.start = t.start, t.finish
            t.fix_notes.append("Swapped start/finish (finish was before start)")
            fixed = True

        if fixed:
            t.was_fixed = True
            stats["fixed"] += 1

    # ── Reassign sequential IDs ──
    for idx, t in enumerate(tasks):
        t.id = idx + 1

    # ── Fix outline levels ──
    for t in tasks:
        if t.outline_level < 1:
            t.outline_level = 1

    return tasks


def build_output_xml(tasks: list[TaskData], project_name: str = "Nusuk Project") -> str:
    """Build a clean MS Project compatible XML from fixed tasks."""

    # Find date range
    all_starts = [t.start for t in tasks if t.start]
    all_finishes = [t.finish for t in tasks if t.finish]
    project_start = min(all_starts) if all_starts else datetime.now()
    project_finish = max(all_finishes) if all_finishes else datetime.now()

    lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Project xmlns="http://schemas.microsoft.com/project">',
        f"  <Name>{escape_xml(project_name)}</Name>",
        f"  <Title>{escape_xml(project_name)}</Title>",
        f"  <CreationDate>{format_date(datetime.now())}</CreationDate>",
        f"  <StartDate>{format_date(project_start)}</StartDate>",
        f"  <FinishDate>{format_date(project_finish)}</FinishDate>",
        "  <CalendarUID>1</CalendarUID>",
        "  <DefaultStartTime>08:00:00</DefaultStartTime>",
        "  <DefaultFinishTime>17:00:00</DefaultFinishTime>",
        "  <MinutesPerDay>480</MinutesPerDay>",
        "  <MinutesPerWeek>2400</MinutesPerWeek>",
        "  <DaysPerMonth>20</DaysPerMonth>",
        "",
        "  <Calendars>",
        "    <Calendar>",
        "      <UID>1</UID>",
        "      <Name>Saudi Standard</Name>",
        "      <IsBaseCalendar>1</IsBaseCalendar>",
        "      <WeekDays>",
    ]

    # Saudi calendar: Sun-Thu working, Fri-Sat off
    # MS Project: 1=Sunday, 2=Monday, ..., 7=Saturday
    day_names = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ]
    working_days = {1, 2, 3, 4, 5}  # Sun-Thu (MS numbering)

    for d in range(1, 8):
        is_working = d in working_days
        lines.append("        <WeekDay>")
        lines.append(f"          <DayType>{d}</DayType>")
        lines.append(f"          <DayWorking>{1 if is_working else 0}</DayWorking>")
        if is_working:
            lines.append("          <WorkingTimes>")
            lines.append("            <WorkingTime>")
            lines.append("              <FromTime>08:00:00</FromTime>")
            lines.append("              <ToTime>17:00:00</ToTime>")
            lines.append("            </WorkingTime>")
            lines.append("          </WorkingTimes>")
        lines.append("        </WeekDay>")

    lines += [
        "      </WeekDays>",
        "    </Calendar>",
        "  </Calendars>",
        "",
        "  <Tasks>",
        "    <Task>",
        "      <UID>0</UID>",
        "      <ID>0</ID>",
        f"      <Name>{escape_xml(project_name)}</Name>",
        "      <Type>1</Type>",
        "      <IsNull>0</IsNull>",
        "      <OutlineLevel>0</OutlineLevel>",
        "      <Summary>1</Summary>",
        "    </Task>",
    ]

    # Write tasks
    for t in tasks:
        lines.append("    <Task>")
        lines.append(f"      <UID>{t.uid}</UID>")
        lines.append(f"      <ID>{t.id}</ID>")
        lines.append(f"      <Name>{escape_xml(t.name)}</Name>")
        if t.wbs:
            lines.append(f"      <WBS>{escape_xml(t.wbs)}</WBS>")
        lines.append(f"      <OutlineLevel>{t.outline_level}</OutlineLevel>")
        if t.outline_number:
            lines.append(
                f"      <OutlineNumber>{escape_xml(t.outline_number)}</OutlineNumber>"
            )
        lines.append(f"      <Start>{format_date(t.start)}</Start>")
        lines.append(f"      <Finish>{format_date(t.finish)}</Finish>")
        lines.append(f"      <Duration>{hours_to_duration_str(t.duration_hours)}</Duration>")
        lines.append("      <DurationFormat>7</DurationFormat>")
        lines.append(f"      <Milestone>{1 if t.is_milestone else 0}</Milestone>")
        lines.append(f"      <Summary>{1 if t.is_summary else 0}</Summary>")
        lines.append(f"      <PercentComplete>{t.percent_complete}</PercentComplete>")
        lines.append(f"      <Priority>{t.priority}</Priority>")
        lines.append(f"      <ConstraintType>{t.constraint_type}</ConstraintType>")

        if t.constraint_date:
            lines.append(
                f"      <ConstraintDate>{format_date(t.constraint_date)}</ConstraintDate>"
            )
        if t.notes:
            lines.append(f"      <Notes>{escape_xml(t.notes)}</Notes>")

        # Predecessors
        for pred in t.predecessors:
            lines.append("      <PredecessorLink>")
            lines.append(f"        <PredecessorUID>{pred['uid']}</PredecessorUID>")
            lines.append(f"        <Type>{pred['type']}</Type>")
            lines.append(f"        <LinkLag>{pred['lag']}</LinkLag>")
            lines.append(f"        <LagFormat>{pred.get('lag_format', 7)}</LagFormat>")
            lines.append("      </PredecessorLink>")

        lines.append("    </Task>")

    lines += [
        "  </Tasks>",
        "",
        "  <Resources>",
        "    <Resource>",
        "      <UID>0</UID>",
        "      <ID>0</ID>",
        "      <Name>Unassigned</Name>",
        "    </Resource>",
        "  </Resources>",
        "",
        "  <Assignments/>",
        "</Project>",
    ]

    return "\n".join(lines)


def escape_xml(s: str) -> str:
    """Escape XML special characters."""
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def print_report(stats: dict, tasks: list[TaskData]):
    """Print validation report."""
    print("\n" + "=" * 60)
    print("  MS PROJECT XML REPAIR REPORT")
    print("=" * 60)
    print(f"  Total tasks detected:     {stats['total_detected']}")
    print(f"  Tasks removed:            {stats['removed']}")
    print(f"  Tasks fixed:              {stats['fixed']}")
    print(f"  Final tasks exported:     {len(tasks)}")
    print("=" * 60)

    if stats["reasons_removed"]:
        print("\n  Removed tasks:")
        for reason in stats["reasons_removed"]:
            print(f"    - {reason}")

    fixed_tasks = [t for t in tasks if t.was_fixed]
    if fixed_tasks:
        print(f"\n  Fixed tasks ({len(fixed_tasks)}):")
        for t in fixed_tasks:
            fixes = "; ".join(t.fix_notes)
            print(f"    - [{t.uid}] {t.name}: {fixes}")

    # Validation
    print("\n  Validation:")
    uids = [t.uid for t in tasks]
    ids = [t.id for t in tasks]
    has_dup_uid = len(uids) != len(set(uids))
    is_sequential = ids == list(range(1, len(ids) + 1))
    all_have_dates = all(t.start and t.finish for t in tasks)

    print(f"    IDs sequential:       {'PASS' if is_sequential else 'FAIL'}")
    print(f"    No duplicate UIDs:    {'PASS' if not has_dup_uid else 'FAIL'}")
    print(f"    All tasks have dates: {'PASS' if all_have_dates else 'FAIL'}")
    print(f"    All tasks have names: {'PASS' if all(t.name for t in tasks) else 'FAIL'}")
    print("=" * 60 + "\n")


def preprocess_xml(content: str) -> str:
    """
    Pre-process the XML content to handle namespace issues.
    Strips the default namespace to make parsing easier.
    """
    # Remove default namespace declaration to simplify parsing
    content = re.sub(
        r'\s+xmlns="http://schemas\.microsoft\.com/project"',
        "",
        content,
    )
    # Also handle other possible namespace declarations
    content = re.sub(r'\s+xmlns:\w+="[^"]*"', "", content)
    return content


def main():
    if len(sys.argv) < 2:
        print("Usage: python fix_project_xml.py input.xml [output.xml]")
        print("       If output.xml is omitted, defaults to fixed_project.xml")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "fixed_project.xml"

    if not os.path.exists(input_file):
        print(f"ERROR: Input file not found: {input_file}")
        sys.exit(1)

    print(f"\nReading: {input_file}")

    # Read and preprocess
    with open(input_file, "r", encoding="utf-8") as f:
        content = f.read()

    file_size = os.path.getsize(input_file)
    print(f"File size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")

    # Strip namespaces for reliable parsing
    content = preprocess_xml(content)

    # Parse XML
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        print(f"ERROR: Failed to parse XML: {e}")
        print("Attempting to fix common XML issues...")

        # Try to fix common issues
        content = content.replace("&", "&amp;")
        content = re.sub(r"&amp;(amp|lt|gt|quot|apos);", r"&\1;", content)
        try:
            root = ET.fromstring(content)
        except ET.ParseError as e2:
            print(f"FATAL: Cannot parse XML even after fixes: {e2}")
            sys.exit(1)

    # Get project name
    project_name = get_text(root, "Name") or get_text(root, "Title") or "Imported Project"
    print(f"Project: {project_name}")

    # Parse tasks
    tasks, stats = parse_tasks(root)
    print(f"Found {len(tasks)} valid tasks (removed {stats['removed']} invalid)")

    if not tasks:
        print("\nERROR: No valid tasks found!")
        print("Possible causes:")
        print("  1. The XML file doesn't contain <Tasks> element")
        print("  2. All tasks have UID=0 or are null")
        print("  3. The file format is not MS Project XML")
        sys.exit(1)

    # Fix tasks
    tasks = fix_tasks(tasks, stats)

    # Build output XML
    output_xml = build_output_xml(tasks, project_name)

    # Write output
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(output_xml)

    output_size = os.path.getsize(output_file)
    print(f"\nWritten: {output_file}")
    print(f"Output size: {output_size:,} bytes ({output_size / 1024:.1f} KB)")

    # Print report
    print_report(stats, tasks)

    print("Done! You can now import the fixed file into Nusuk platform.")


if __name__ == "__main__":
    main()
