import { Outlet } from 'react-router';
import {
  Toolbar,
  ToolbarDescription,
  ToolbarHeading,
  ToolbarPageTitle,
} from '@/components/layouts/layout-1/components/toolbar';

const GeneralSettings = () => {
  return (
    <div className="container">
      <Toolbar className="w-full">
        <ToolbarHeading>
          <ToolbarPageTitle>General Settings</ToolbarPageTitle>
          <ToolbarDescription>
            Configure your general settings
          </ToolbarDescription>
        </ToolbarHeading>
      </Toolbar>
      {/* <div className="grid gap-5 lg:gap-7.5 xl:w-155 mx-auto"> */}
        <Outlet />
      {/* </div> */}
    </div>
  );
};

export default GeneralSettings;
