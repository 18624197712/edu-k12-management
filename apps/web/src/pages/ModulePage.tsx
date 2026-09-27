import { Empty } from 'antd';
import { useParams } from 'react-router-dom';
import type { ComponentType } from 'react';
import { LearningReportsPage, PlansPage } from './domains/AcademicPages';
import { ArchivesPage } from './StudentArchives';
import { ScoresPage } from './StudentScores';
import { ParentMeetingsPage, RecommendationsPage, TrainingPage } from './domains/EngagementPages';
import { BusinessPage, RenewalPage } from './domains/OperationsPages';
import { CoursesPage } from './Courses';
import { ProfilePage, ReportsPage } from './domains/ReportsProfilePages';

const pages:Record<string,ComponentType>={
  archives:ArchivesPage,plans:PlansPage,scores:ScoresPage,courses:CoursesPage,'learning-reports':LearningReportsPage,
  'parent-meetings':ParentMeetingsPage,renewals:RenewalPage,business:BusinessPage,recommendations:RecommendationsPage,
  training:TrainingPage,reports:ReportsPage,profile:ProfilePage,
};

export function ModulePage(){const{module}=useParams();const Page=module?pages[module]:undefined;return Page?<Page/>:<Empty description="页面不存在"/>}
