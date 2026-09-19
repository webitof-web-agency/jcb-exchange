import type { Metadata } from 'next';

const privateRecruitmentRobots: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};

const recruitmentMetadata = {
  overview: {
    title: 'Recruitment | JCB Exchange Portal',
    description: 'Manage recruitment operations, hiring workflows, candidates, interviews, offers, and pipeline stages.',
  },
  dashboard: {
    title: 'Recruitment Dashboard | JCB Exchange Portal',
    description: 'Review recruitment metrics, hiring pipeline performance, recent applications, interviews, and offers.',
  },
  applications: {
    title: 'Applications | Recruitment | JCB Exchange Portal',
    description: 'Review and manage candidate applications, hiring stages, ratings, interviews, offers, and documents.',
  },
  applicationDetail: {
    title: 'Application Details | Recruitment | JCB Exchange Portal',
    description: 'Review a candidate application, submitted information, hiring history, ratings, interviews, offers, and documents.',
  },
  candidates: {
    title: 'Candidates | Recruitment | JCB Exchange Portal',
    description: 'Browse and manage the recruitment candidate talent pool and hiring activity.',
  },
  departments: {
    title: 'Departments | Recruitment | JCB Exchange Portal',
    description: 'Manage recruitment departments used to organize jobs and hiring workflows.',
  },
  interviews: {
    title: 'Interviews | Recruitment | JCB Exchange Portal',
    description: 'Schedule, review, and manage candidate interviews and interview scorecards.',
  },
  jobs: {
    title: 'Jobs | Recruitment | JCB Exchange Portal',
    description: 'Create, review, and manage recruitment job postings and hiring requirements.',
  },
  jobDetail: {
    title: 'Job Details | Recruitment | JCB Exchange Portal',
    description: 'Review job posting details, requirements, application settings, and recruitment pipeline activity.',
  },
  offers: {
    title: 'Offers | Recruitment | JCB Exchange Portal',
    description: 'Create and manage employment offers, offer status, compensation, and joining dates.',
  },
  pipeline: {
    title: 'Pipeline Stages | Recruitment | JCB Exchange Portal',
    description: 'Manage the dynamic recruitment pipeline stages used across candidate applications.',
  },
  settings: {
    title: 'Recruitment Settings | JCB Exchange Portal',
    description: 'Configure recruitment templates, notifications, and hiring workflow settings.',
  },
} as const;

export type RecruitmentMetadataKey = keyof typeof recruitmentMetadata;

export function getRecruitmentMetadata(key: RecruitmentMetadataKey): Metadata {
  const page = recruitmentMetadata[key];

  return {
    title: page.title,
    description: page.description,
    robots: privateRecruitmentRobots,
  };
}

export const recruitmentRootMetadata: Metadata = {
  title: 'Recruitment | JCB Exchange Portal',
  description: recruitmentMetadata.overview.description,
  robots: privateRecruitmentRobots,
};
