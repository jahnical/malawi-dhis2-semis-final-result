import { Button, ButtonStrip, IconCheckmarkCircle16, Tag } from "@dhis2/ui";
import { ModalComponent, SummaryCard, Table, WithPadding } from "dhis2-semis-components";
import styles from './showStats.module.css'
import { Collapse } from "@mui/material";
import { useState } from "react";
import { useHeader, useUrlParams, useViewPortWidth } from "dhis2-semis-functions";
import { ProgramConfig, TableDataRefetch } from "dhis2-semis-types";
import { useSetRecoilState } from "recoil";
import useGetSelectedKeys from "../../hooks/config/useGetSelectedKeys";
import { InfoOutlined } from "@mui/icons-material";
import { getContextualLabels } from "../../utils/common/getContextualLabels";
import i18next from "@dhis2/d2-i18n";

export default function ShowStats({ stats, open, setOpen }: { setOpen: (args: boolean) => void, open: boolean, stats: any }) {
    const [showDetails, setShowDetails] = useState(false)
    const { dataStoreData, program: programData } = useGetSelectedKeys();
    const { viewPortWidth } = useViewPortWidth();
    const { urlParameters } = useUrlParams();
    const { sectionType } = urlParameters;
    const { columns } = useHeader({ dataStoreData, programConfigData: programData as unknown as ProgramConfig, programStage: dataStoreData?.registration?.programStage as unknown as string });
    const setRefetch = useSetRecoilState(TableDataRefetch);
    const labels = getContextualLabels(sectionType as string)
    // Learners the server rejected (nothing was saved for them), with each distinct reason once
    const failed: any[] = stats?.failed ?? []
    const failureReasons = Array.from(failed.reduce((acc: Map<string, number>, x: any) => acc.set(x.reason, (acc.get(x.reason) ?? 0) + 1), new Map<string, number>()))

    return (
        <ModalComponent
            open={open}
            handleClose={() => setOpen(!open)}
            children={
                <div>
                    <Tag positive icon={<IconCheckmarkCircle16 />}> {labels.summaryPreviewTag} </Tag>

                    <WithPadding />
                    <label className={styles.title}>Summary</label>
                    <WithPadding />

                    <ButtonStrip>
                        <SummaryCard color="success" label={labels.successLabel} value={stats?.posted ?? 0} />
                        <SummaryCard color="error" label={labels.failureLabel} value={(stats?.conflicts?.length ?? 0) + failed.length} />
                    </ButtonStrip>

                    <WithPadding />
                    {stats?.conflicts?.length > 0 ?
                        <>
                            <ButtonStrip>
                                <Button small icon={<InfoOutlined />} onClick={() => setShowDetails(!showDetails)}>More details</Button>
                            </ButtonStrip>
                            <br />
                            <span style={{ color: "red" }}>{labels.conflictMessage}</span>
                        </>
                        : null}
                    {failed.length > 0 ?
                        <>
                            <br />
                            <span style={{ color: "red" }}>
                                {i18next.t("{{count}} could not be saved, and nothing was changed for them:", { count: failed.length })}
                            </span>
                            <ul style={{ color: "red", margin: "4px 0 0 0" }}>
                                {failureReasons.map(([reason, count]: any) => <li key={reason}>{reason}{count > 1 ? ` (${count})` : ""}</li>)}
                            </ul>
                        </>
                        : null}
                    <WithPadding />

                    <Collapse in={showDetails} style={{ marginBottom: "20px" }} >
                        <WithPadding>
                            <Table
                                programConfig={programData!}
                                viewPortWidth={viewPortWidth}
                                columns={columns}
                                tableData={stats.conflicts}
                                showHeaderFilters={false}
                                showWorkingListsContainer={false}
                                paginate={false}
                            />
                        </WithPadding>
                    </Collapse>

                    <ButtonStrip end>
                        <Button primary={true} onClick={() => { setOpen(false); setRefetch(prev => (!prev)) }} >
                            Close
                        </Button>
                    </ButtonStrip>
                </ div>
            }
            title={labels.summaryTitle}
        />
    )
}