/**
 * MS Project XML Exporter
 * Generates full Microsoft Project-compatible XML (2003 format)
 * that can be opened directly in MS Project.
 */

interface ProjectInfo {
  name: string;
  startDate: string;
  calendarName: string;
}

interface MSProjectTask {
  uid: number;
  id: number;
  name: string;
  wbs: string;
  outlineLevel: number;
  outlineNumber: string;
  start: Date;
  finish: Date;
  duration: number; // working days
  isMilestone: boolean;
  isSummary: boolean;
  percentComplete: number;
  constraintType: number; // MS Project code
  constraintDate?: Date;
  baselineStart?: Date;
  baselineFinish?: Date;
  notes?: string;
  predecessors: {
    predecessorUID: number;
    type: number;
    lag: number;
  }[];
  priority: number;
  isCritical: boolean;
}

interface MSProjectResource {
  uid: number;
  id: number;
  name: string;
  email?: string;
}

interface MSProjectAssignment {
  uid: number;
  taskUID: number;
  resourceUID: number;
  units: number; // 1.0 = 100%
}

interface CalendarForExport {
  name: string;
  workDays: number[];
  workStartHour: number;
  workEndHour: number;
  holidays: { date: string; name: string }[];
}

// MS Project constraint type codes
const CONSTRAINT_MAP: Record<string, number> = {
  ASAP: 0,
  ALAP: 1,
  MSO: 2,
  MFO: 3,
  SNET: 4,
  SNLT: 5,
  FNET: 6,
  FNLT: 7,
};

// MS Project dependency type codes
const DEP_TYPE_MAP: Record<string, number> = {
  FF: 0,
  FS: 1,
  SF: 2,
  SS: 3,
};

// MS Project priority mapping (0-1000)
const PRIORITY_MAP: Record<string, number> = {
  low: 200,
  medium: 500,
  high: 700,
  critical: 900,
};

function formatMSDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

function formatDuration(days: number): string {
  // MS Project format: PT{hours}H0M0S
  const hours = Math.round(days * 8);
  return `PT${hours}H0M0S`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateMSProjectXML(
  project: ProjectInfo,
  tasks: MSProjectTask[],
  resources: MSProjectResource[],
  assignments: MSProjectAssignment[],
  calendar: CalendarForExport,
): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>${escapeXml(project.name)}</Name>
  <Title>${escapeXml(project.name)}</Title>
  <CreationDate>${formatMSDate(new Date())}</CreationDate>
  <StartDate>${project.startDate}T09:00:00</StartDate>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>0${calendar.workStartHour}:00:00</DefaultStartTime>
  <DefaultFinishTime>${calendar.workEndHour}:00:00</DefaultFinishTime>
  <MinutesPerDay>${(calendar.workEndHour - calendar.workStartHour) * 60}</MinutesPerDay>
  <MinutesPerWeek>${(calendar.workEndHour - calendar.workStartHour) * 60 * calendar.workDays.length}</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>

  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>${escapeXml(calendar.name)}</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <WeekDays>`;

  // Generate week days
  for (let d = 0; d < 7; d++) {
    const isWorking = calendar.workDays.includes(d);
    // MS Project uses 1=Sunday, 2=Monday, ...
    const msDay = d + 1;
    xml += `
        <WeekDay>
          <DayType>${msDay}</DayType>
          <DayWorking>${isWorking ? 1 : 0}</DayWorking>${
      isWorking
        ? `
          <WorkingTimes>
            <WorkingTime>
              <FromTime>0${calendar.workStartHour}:00:00</FromTime>
              <ToTime>${calendar.workEndHour}:00:00</ToTime>
            </WorkingTime>
          </WorkingTimes>`
        : ''
    }
        </WeekDay>`;
  }

  xml += `
      </WeekDays>`;

  // Add holidays as exceptions
  if (calendar.holidays.length > 0) {
    xml += `
      <Exceptions>`;
    calendar.holidays.forEach((h, i) => {
      xml += `
        <Exception>
          <EnteredByOccurrences>0</EnteredByOccurrences>
          <TimePeriod>
            <FromDate>${h.date}T00:00:00</FromDate>
            <ToDate>${h.date}T23:59:00</ToDate>
          </TimePeriod>
          <Occurrences>1</Occurrences>
          <Name>${escapeXml(h.name)}</Name>
          <Type>1</Type>
          <DayWorking>0</DayWorking>
        </Exception>`;
    });
    xml += `
      </Exceptions>`;
  }

  xml += `
    </Calendar>
  </Calendars>

  <Tasks>
    <Task>
      <UID>0</UID>
      <ID>0</ID>
      <Name>${escapeXml(project.name)}</Name>
      <Type>1</Type>
      <IsNull>0</IsNull>
      <OutlineLevel>0</OutlineLevel>
      <Summary>1</Summary>
    </Task>`;

  // Tasks
  for (const task of tasks) {
    xml += `
    <Task>
      <UID>${task.uid}</UID>
      <ID>${task.id}</ID>
      <Name>${escapeXml(task.name)}</Name>
      <WBS>${escapeXml(task.wbs)}</WBS>
      <OutlineLevel>${task.outlineLevel}</OutlineLevel>
      <OutlineNumber>${escapeXml(task.outlineNumber)}</OutlineNumber>
      <Start>${formatMSDate(task.start)}</Start>
      <Finish>${formatMSDate(task.finish)}</Finish>
      <Duration>${formatDuration(task.duration)}</Duration>
      <DurationFormat>7</DurationFormat>
      <Milestone>${task.isMilestone ? 1 : 0}</Milestone>
      <Summary>${task.isSummary ? 1 : 0}</Summary>
      <PercentComplete>${Math.round(task.percentComplete)}</PercentComplete>
      <Priority>${task.priority}</Priority>
      <ConstraintType>${task.constraintType}</ConstraintType>${
      task.constraintDate
        ? `
      <ConstraintDate>${formatMSDate(task.constraintDate)}</ConstraintDate>`
        : ''
    }${
      task.baselineStart
        ? `
      <BaselineStart>${formatMSDate(task.baselineStart)}</BaselineStart>
      <BaselineFinish>${formatMSDate(task.baselineFinish!)}</BaselineFinish>
      <BaselineDuration>${formatDuration(task.duration)}</BaselineDuration>`
        : ''
    }${
      task.notes
        ? `
      <Notes>${escapeXml(task.notes)}</Notes>`
        : ''
    }`;

    // Predecessor links
    if (task.predecessors.length > 0) {
      for (const pred of task.predecessors) {
        xml += `
      <PredecessorLink>
        <PredecessorUID>${pred.predecessorUID}</PredecessorUID>
        <Type>${pred.type}</Type>
        <LinkLag>${Math.round(pred.lag * 4800)}</LinkLag>
        <LagFormat>7</LagFormat>
      </PredecessorLink>`;
      }
    }

    xml += `
    </Task>`;
  }

  xml += `
  </Tasks>

  <Resources>
    <Resource>
      <UID>0</UID>
      <ID>0</ID>
      <Name>Unassigned</Name>
    </Resource>`;

  for (const res of resources) {
    xml += `
    <Resource>
      <UID>${res.uid}</UID>
      <ID>${res.id}</ID>
      <Name>${escapeXml(res.name)}</Name>${
      res.email
        ? `
      <EmailAddress>${escapeXml(res.email)}</EmailAddress>`
        : ''
    }
      <Type>1</Type>
      <MaxUnits>1.0</MaxUnits>
    </Resource>`;
  }

  xml += `
  </Resources>

  <Assignments>`;

  for (const asn of assignments) {
    xml += `
    <Assignment>
      <UID>${asn.uid}</UID>
      <TaskUID>${asn.taskUID}</TaskUID>
      <ResourceUID>${asn.resourceUID}</ResourceUID>
      <Units>${asn.units}</Units>
    </Assignment>`;
  }

  xml += `
  </Assignments>
</Project>`;

  return xml;
}

/**
 * Parse MS Project XML and return structured data
 */
export function parseMSProjectXML(xmlContent: string): {
  projectName: string;
  tasks: Array<{
    uid: number;
    name: string;
    wbs: string;
    outlineLevel: number;
    start: string;
    finish: string;
    duration: number;
    isMilestone: boolean;
    isSummary: boolean;
    percentComplete: number;
    notes: string;
    predecessors: { uid: number; type: string; lag: number }[];
  }>;
  resources: Array<{ uid: number; name: string; email?: string }>;
  assignments: Array<{ taskUID: number; resourceUID: number; units: number }>;
} {
  // Simple XML parser using regex for MS Project format
  const getTag = (xml: string, tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
    return match ? match[1].trim() : '';
  };

  const getAllTags = (xml: string, tag: string): string[] => {
    const results: string[] = [];
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 'gs');
    let match;
    while ((match = regex.exec(xml)) !== null) {
      results.push(match[1].trim());
    }
    return results;
  };

  const projectName = getTag(xmlContent, 'Name') || 'Imported Project';

  // Parse tasks
  const taskBlocks = getAllTags(xmlContent, 'Task');
  const depTypeReverse: Record<string, string> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' };

  const tasks = taskBlocks
    .filter((block) => {
      const uid = parseInt(getTag(block, 'UID'), 10);
      return uid > 0;
    })
    .map((block) => {
      const predBlocks = getAllTags(block, 'PredecessorLink');
      const predecessors = predBlocks.map((pb) => ({
        uid: parseInt(getTag(pb, 'PredecessorUID'), 10),
        type: depTypeReverse[getTag(pb, 'Type')] || 'FS',
        lag: parseInt(getTag(pb, 'LinkLag') || '0', 10) / 4800,
      }));

      const durationStr = getTag(block, 'Duration');
      let durationDays = 1;
      if (durationStr) {
        const hourMatch = durationStr.match(/PT(\d+)H/);
        if (hourMatch) durationDays = parseInt(hourMatch[1], 10) / 8;
      }

      return {
        uid: parseInt(getTag(block, 'UID'), 10),
        name: getTag(block, 'Name'),
        wbs: getTag(block, 'WBS'),
        outlineLevel: parseInt(getTag(block, 'OutlineLevel') || '1', 10),
        start: getTag(block, 'Start'),
        finish: getTag(block, 'Finish'),
        duration: durationDays,
        isMilestone: getTag(block, 'Milestone') === '1',
        isSummary: getTag(block, 'Summary') === '1',
        percentComplete: parseInt(getTag(block, 'PercentComplete') || '0', 10),
        notes: getTag(block, 'Notes'),
        predecessors,
      };
    });

  // Parse resources
  const resourceBlocks = getAllTags(xmlContent, 'Resource');
  const resources = resourceBlocks
    .filter((block) => {
      const uid = parseInt(getTag(block, 'UID'), 10);
      return uid > 0;
    })
    .map((block) => ({
      uid: parseInt(getTag(block, 'UID'), 10),
      name: getTag(block, 'Name'),
      email: getTag(block, 'EmailAddress') || undefined,
    }));

  // Parse assignments
  const assignBlocks = getAllTags(xmlContent, 'Assignment');
  const assignments = assignBlocks.map((block) => ({
    taskUID: parseInt(getTag(block, 'TaskUID'), 10),
    resourceUID: parseInt(getTag(block, 'ResourceUID'), 10),
    units: parseFloat(getTag(block, 'Units') || '1'),
  }));

  return { projectName, tasks, resources, assignments };
}

export { CONSTRAINT_MAP, DEP_TYPE_MAP, PRIORITY_MAP };
