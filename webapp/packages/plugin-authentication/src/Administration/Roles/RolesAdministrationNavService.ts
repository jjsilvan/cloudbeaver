/*
 * CloudBeaver - Cloud Database Manager
 * Copyright (C) 2020-2021 DBeaver Corp and others
 *
 * Licensed under the Apache License, Version 2.0.
 * you may not use this file except in compliance with the License.
 */

import { AdministrationScreenService } from '@cloudbeaver/core-administration';
import { injectable } from '@cloudbeaver/core-di';

@injectable()
export class RolesAdministrationNavService {
  constructor(
    private administrationScreenService: AdministrationScreenService
  ) { }

  navToRoot(): void {
    this.administrationScreenService.navigateToItem('roles');
  }

  navToCreate(): void {
    this.administrationScreenService.navigateToItemSub('roles', 'create');
  }
}