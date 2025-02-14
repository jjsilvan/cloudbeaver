/*
 * CloudBeaver - Cloud Database Manager
 * Copyright (C) 2020-2023 DBeaver Corp and others
 *
 * Licensed under the Apache License, Version 2.0.
 * you may not use this file except in compliance with the License.
 */
import { observer } from 'mobx-react-lite';
import styled from 'reshadow';

import { useResource, useStyles } from '@cloudbeaver/core-blocks';
import {
  ConnectionDialectResource,
  ConnectionInfoActiveProjectKey,
  ConnectionInfoResource,
  createConnectionParam,
} from '@cloudbeaver/core-connections';
import { MENU_BAR_DEFAULT_STYLES, MenuBar } from '@cloudbeaver/core-ui';
import { useMenu } from '@cloudbeaver/core-view';
import type { NavNodeTransformViewComponent } from '@cloudbeaver/plugin-navigation-tree';
import { SQLCodeEditorLoader, useSqlDialectExtension } from '@cloudbeaver/plugin-sql-editor-new';

import { DATA_CONTEXT_DDL_VIEWER_NODE } from '../DdlViewer/DATA_CONTEXT_DDL_VIEWER_NODE';
import { DATA_CONTEXT_DDL_VIEWER_VALUE } from '../DdlViewer/DATA_CONTEXT_DDL_VIEWER_VALUE';
import { MENU_DDL_VIEWER_FOOTER } from '../DdlViewer/MENU_DDL_VIEWER_FOOTER';
import { TAB_PANEL_STYLES } from '../TAB_PANEL_STYLES';
import { ExtendedDDLResource } from './ExtendedDDLResource';

export const ExtendedDDLViewerTabPanel: NavNodeTransformViewComponent = observer(function ExtendedDDLViewerTabPanel({ nodeId, folderId }) {
  const style = useStyles(TAB_PANEL_STYLES);
  const menu = useMenu({ menu: MENU_DDL_VIEWER_FOOTER });

  const extendedDDLResource = useResource(ExtendedDDLViewerTabPanel, ExtendedDDLResource, nodeId);

  const connectionInfoResource = useResource(ExtendedDDLViewerTabPanel, ConnectionInfoResource, ConnectionInfoActiveProjectKey);
  const connection = connectionInfoResource.resource.getConnectionForNode(nodeId);
  const connectionParam = connection ? createConnectionParam(connection) : null;
  const connectionDialectResource = useResource(ExtendedDDLViewerTabPanel, ConnectionDialectResource, connectionParam);
  const sqlDialect = useSqlDialectExtension(connectionDialectResource.data);

  menu.context.set(DATA_CONTEXT_DDL_VIEWER_NODE, nodeId);
  menu.context.set(DATA_CONTEXT_DDL_VIEWER_VALUE, extendedDDLResource.data);

  return styled(style)(
    <wrapper>
      <SQLCodeEditorLoader value={extendedDDLResource.data ?? ''} extensions={[sqlDialect]} readonly />
      <MenuBar menu={menu} style={MENU_BAR_DEFAULT_STYLES} />
    </wrapper>,
  );
});
