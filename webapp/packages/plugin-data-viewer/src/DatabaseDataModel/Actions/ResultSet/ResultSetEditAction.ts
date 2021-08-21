/*
 * CloudBeaver - Cloud Database Manager
 * Copyright (C) 2020-2021 DBeaver Corp and others
 *
 * Licensed under the Apache License, Version 2.0.
 * you may not use this file except in compliance with the License.
 */

import { computed, makeObservable, observable, toJS } from 'mobx';

import { ResultDataFormat, SqlResultRow, UpdateResultsDataBatchMutationVariables } from '@cloudbeaver/core-sdk';
import { uuid } from '@cloudbeaver/core-utils';

import type { IDatabaseDataSource } from '../../IDatabaseDataSource';
import type { IDatabaseResultSet } from '../../IDatabaseResultSet';
import { databaseDataAction } from '../DatabaseDataActionDecorator';
import { DatabaseEditAction } from '../DatabaseEditAction';
import { DatabaseEditChangeType, IDatabaseDataEditActionData } from '../IDatabaseDataEditAction';
import type { IResultSetColumnKey, IResultSetElementKey, IResultSetRowKey } from './IResultSetDataKey';
import { isResultSetContentValue } from './isResultSetContentValue';
import { ResultSetDataAction } from './ResultSetDataAction';
import { ResultSetDataKeysUtils } from './ResultSetDataKeysUtils';
import type { IResultSetValue } from './ResultSetFormatAction';

export interface IResultSetUpdate {
  row: IResultSetRowKey;
  type: DatabaseEditChangeType;
  update: IResultSetValue[];
  source?: IResultSetValue[];
}

export type IResultSetEditActionData = IDatabaseDataEditActionData<IResultSetElementKey, IResultSetValue>;

@databaseDataAction()
export class ResultSetEditAction
  extends DatabaseEditAction<IResultSetElementKey, IResultSetValue, IDatabaseResultSet> {
  static dataFormat = ResultDataFormat.Resultset;

  private editorData: Map<string, IResultSetUpdate>;
  private data: ResultSetDataAction;

  constructor(source: IDatabaseDataSource<any, IDatabaseResultSet>, result: IDatabaseResultSet) {
    super(source, result);
    this.editorData = new Map();
    this.data = this.getAction(ResultSetDataAction);
    this.features = ['add', 'delete'];

    makeObservable<this, 'editorData'>(this, {
      editorData: observable,
      addRows: computed,
      updates: computed,
    });
  }

  get addRows(): IResultSetRowKey[] {
    return Array.from(this.editorData.values())
      .filter(update => update.type === DatabaseEditChangeType.add)
      .map(update => update.row);
  }

  get updates(): IResultSetUpdate[] {
    return Array.from(this.editorData.values())
      .sort((a, b) => {
        if (a.type !== b.type) {
          if (a.type === DatabaseEditChangeType.update) {
            return -1;
          }

          if (b.type === DatabaseEditChangeType.update) {
            return 1;
          }
        }

        return a.row.index - b.row.index;
      });
  }

  isEdited(): boolean {
    return this.editorData.size > 0;
  }

  isElementEdited(key: IResultSetElementKey): boolean {
    const update = this.editorData.get(ResultSetDataKeysUtils.serialize(key.row));

    if (!update) {
      return false;
    }

    if (update.source === undefined || update.type === DatabaseEditChangeType.delete) {
      return true;
    }

    return !this.compareCellValue(update.source[key.column.index], update.update[key.column.index]);
  }

  isRowEdited(key: IResultSetRowKey): boolean {
    const update = this.editorData.get(ResultSetDataKeysUtils.serialize(key));

    if (!update) {
      return false;
    }

    return true;
  }

  getElementState(key: IResultSetElementKey): DatabaseEditChangeType | null {
    const update = this.editorData.get(ResultSetDataKeysUtils.serialize(key.row));

    if (!update) {
      return null;
    }

    if (update.source === undefined || update.type !== DatabaseEditChangeType.update) {
      return update.type;
    }

    if (!this.compareCellValue(update.source[key.column.index], update.update[key.column.index])) {
      return update.type;
    }

    return null;
  }

  get(key: IResultSetElementKey): IResultSetValue | undefined {
    return this.editorData
      .get(ResultSetDataKeysUtils.serialize(key.row))
      ?.update[key.column.index];
  }

  set(key: IResultSetElementKey, value: IResultSetValue): void {
    const [update] = this.getOrCreateUpdate(key.row, DatabaseEditChangeType.update);
    const prevValue = update.source?.[key.column.index] as any;

    if (isResultSetContentValue(prevValue) && value !== null) {
      if ('text' in prevValue) {
        value = {
          ...prevValue,
          text: String(value),
          contentLength: String(value).length,
        };
      }
    }

    update.update[key.column.index] = value;

    this.action.execute({
      resultId: this.result.id,
      type: update.type,
      revert: false,
      value: {
        key,
        prevValue,
        value,
      },
    });

    this.removeEmptyUpdate(update);
  }

  add(key?: IResultSetElementKey): void {
    let row = key?.row;
    let column = key?.column;

    if (!row) {
      row = this.data.getDefaultKey().row;
    }

    if (!column) {
      column = this.data.getDefaultKey().column;
    }

    this.addRow(row, undefined, column);
  }

  addRow(row: IResultSetRowKey, value?: IResultSetValue[], column?: IResultSetColumnKey): void {
    if (value === undefined) {
      value = this.data.columns.map(() => null);
    }

    row = { ...row, key: uuid() };

    if (!column) {
      column = this.data.getDefaultKey().column;
    }

    const [update, created] = this.getOrCreateUpdate(row, DatabaseEditChangeType.add, value);

    if (created) {
      this.action.execute({
        resultId: this.result.id,
        type: update.type,
        revert: false,
        value: {
          key: { column, row },
        },
      });
    }
  }

  delete(key: IResultSetElementKey): void {
    this.deleteRow(key.row, key.column);
  }

  deleteRow(key: IResultSetRowKey, column?: IResultSetColumnKey): void {
    const serializedKey = ResultSetDataKeysUtils.serialize(key);
    const update = this.editorData.get(serializedKey);

    if (update && update.type !== DatabaseEditChangeType.delete) {
      this.editorData.delete(serializedKey);
    }

    if (!column) {
      column = this.data.getDefaultKey().column;
    }

    if (update?.type !== DatabaseEditChangeType.add) {
      const [update, created] = this.getOrCreateUpdate(key, DatabaseEditChangeType.delete);

      if (created) {
        this.action.execute({
          resultId: this.result.id,
          type: update.type,
          revert: false,
          value: {
            key: { column, row: key },
          },
        });
      }
    } else {
      this.action.execute({
        resultId: this.result.id,
        type: update.type,
        revert: true,
        value: {
          key: { column, row: key },
        },
      });
    }
  }

  applyUpdate(result: IDatabaseResultSet): void {
    let rowIndex = 0;
    let shift = 0;

    if (result.data?.rows?.length !== this.updates.length) {
      console.warn('ResultSetEditAction: returned data differs from performed update');
    }

    for (const update of this.updates) {
      switch (update.type) {
        case DatabaseEditChangeType.update: {
          const value = result.data?.rows?.[rowIndex];

          if (value !== undefined) {
            this.data.setRowValue(update.row, value, shift);
          }

          rowIndex++;
          break;
        }

        case DatabaseEditChangeType.add: {
          const value = result.data?.rows?.[rowIndex];

          if (value !== undefined) {
            this.data.insertRow(update.row, value, shift);
          }

          rowIndex++;
          shift++;
          break;
        }

        case DatabaseEditChangeType.delete: {
          this.data.removeRow(update.row, shift);
          shift--;
          break;
        }
      }
    }
    this.clear();
  }

  revert(key: IResultSetElementKey): void {
    const row = ResultSetDataKeysUtils.serialize(key.row);
    const update = this.editorData.get(row);

    if (!update) {
      return;
    }

    let prevValue: IResultSetValue | undefined;
    let value: IResultSetValue | undefined;

    if (update.type === DatabaseEditChangeType.delete) {
      this.editorData.delete(row);
    } else {
      prevValue = update.update[key.column.index];
      value = update.source?.[key.column.index] ?? null;
      update.update[key.column.index] = value;
    }

    this.action.execute({
      resultId: this.result.id,
      type: update.type,
      revert: true,
      value: {
        key,
        prevValue,
        value,
      },
    });

    this.removeEmptyUpdate(update);
  }

  clear(): void {
    this.editorData.clear();

    this.action.execute({
      resultId: this.result.id,
      revert: true,
    });
  }

  fillBatch(batch: UpdateResultsDataBatchMutationVariables): void {
    for (const update of this.updates) {
      switch (update.type) {
        case DatabaseEditChangeType.update: {
          if (batch.updatedRows === undefined) {
            batch.updatedRows = [];
          }
          const updatedRows = batch.updatedRows as SqlResultRow[];

          if (update.source) {
            updatedRows.push({
              data: update.source,
              updateValues: update.update.reduce<Record<number, IResultSetValue>>((obj, value, index) => {
                if (value !== update.source![index]) {
                  obj[index] = value;
                }
                return obj;
              }, {}),
            });
          }
          break;
        }

        case DatabaseEditChangeType.add: {
          if (batch.addedRows === undefined) {
            batch.addedRows = [];
          }
          const addedRows = batch.addedRows as SqlResultRow[];

          addedRows.push({ data: update.update });
          break;
        }

        case DatabaseEditChangeType.delete: {
          if (batch.deletedRows === undefined) {
            batch.deletedRows = [];
          }
          const deletedRows = batch.deletedRows as SqlResultRow[];

          deletedRows.push({ data: update.update });
          break;
        }
      }
    }
  }

  private removeEmptyUpdate(update: IResultSetUpdate) {
    if (update.type === DatabaseEditChangeType.add) {
      return;
    }

    if (update.source && !update.source.some(
      (value, i) => !this.compareCellValue(value, update.update[i])
    )) {
      this.editorData.delete(ResultSetDataKeysUtils.serialize(update.row));
    }
  }

  private getOrCreateUpdate(
    row: IResultSetRowKey,
    type: DatabaseEditChangeType,
    update?: IResultSetValue[]
  ): [IResultSetUpdate, boolean] {
    const key = ResultSetDataKeysUtils.serialize(row);
    let created = false;

    if (!this.editorData.has(key)) {
      let source: IResultSetValue[] | undefined;

      if (type !== DatabaseEditChangeType.add) {
        source = this.data.getRowValue(row);
      } else {
        source = [...update || []];
      }

      this.editorData.set(key, {
        row,
        type,
        source,
        update: observable([...source || update || []]),
      });
      created = true;
    }

    return [this.editorData.get(key)!, created];
  }

  private compareCellValue(valueA: any, valueB: any) {
    valueA = valueA === undefined ? '' : valueA;
    valueB = valueB === undefined ? '' : valueB;

    if (typeof valueA === 'number' || typeof valueB === 'number') {
      return String(valueA) === String(valueB);
    }

    if (typeof valueA === 'boolean' || typeof valueB === 'boolean') {
      return String(valueA).toLowerCase() === String(valueB).toLowerCase();
    }

    if (isResultSetContentValue(valueA) && isResultSetContentValue(valueB)) {
      if ('text' in valueA && 'text' in valueB) {
        return valueA.text === valueB.text;
      }
    }

    return valueA === valueB;
  }
}