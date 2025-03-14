import React from 'react';
import styles from './ASTViewer.module.css';
import { objType } from './utils';

export interface PropertyValueProps {
  readonly value: unknown;
}

function PropertyValue(props: PropertyValueProps): JSX.Element {
  if (typeof props.value === 'string') {
    return (
      <span className={styles.propString}>{JSON.stringify(props.value)}</span>
    );
  } else if (typeof props.value === 'number') {
    return <span className={styles.propNumber}>{props.value}</span>;
  } else if (typeof props.value === 'bigint') {
    return <span className={styles.propNumber}>{String(props.value)}n</span>;
  } else if (props.value instanceof RegExp) {
    return <span className={styles.propRegExp}>{String(props.value)}</span>;
  } else if (typeof props.value === 'undefined' || props.value === null) {
    return <span className={styles.propEmpty}>{String(props.value)}</span>;
  } else if (typeof props.value === 'boolean') {
    return (
      <span className={styles.propBoolean}>
        {props.value ? 'true' : 'false'}
      </span>
    );
  }
  return <span className={styles.propClass}>{objType(props.value)}</span>;
}

export default PropertyValue;
