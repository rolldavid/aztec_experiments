export default {
  "artifact_version": 1,
  "noir_version": "1.0.0-rc.3+5a7ee9bf5ed8973076df7bb0d2b723024db09ae7",
  "hash": "14589330992016937639",
  "abi": {
    "abi_version": 1,
    "parameters": [
      {
        "name": "previous_kernel_public_inputs",
        "type": {
          "kind": "struct",
          "path": "types::abis::kernel_circuit_public_inputs::private_to_rollup_kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs",
          "fields": [
            {
              "name": "constants",
              "type": {
                "kind": "struct",
                "path": "types::abis::tx_constant_data::TxConstantData",
                "fields": [
                  {
                    "name": "anchor_block_header",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::block_header::BlockHeader",
                      "fields": [
                        {
                          "name": "last_archive",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                            "fields": [
                              {
                                "name": "root",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "next_available_leaf_index",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "state",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::state_reference::StateReference",
                            "fields": [
                              {
                                "name": "l1_to_l2_message_tree",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                  "fields": [
                                    {
                                      "name": "root",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "next_available_leaf_index",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "partial",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::partial_state_reference::PartialStateReference",
                                  "fields": [
                                    {
                                      "name": "note_hash_tree",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                        "fields": [
                                          {
                                            "name": "root",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "next_available_leaf_index",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "nullifier_tree",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                        "fields": [
                                          {
                                            "name": "root",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "next_available_leaf_index",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "public_data_tree",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                        "fields": [
                                          {
                                            "name": "root",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "next_available_leaf_index",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "sponge_blob_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "tx_effects_tree_root",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "global_variables",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::global_variables::GlobalVariables",
                            "fields": [
                              {
                                "name": "chain_id",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "version",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "block_number",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "slot_number",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "timestamp",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 64
                                }
                              },
                              {
                                "name": "coinbase",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::eth_address::EthAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "fee_recipient",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "gas_fees",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas_fees::GasFees",
                                  "fields": [
                                    {
                                      "name": "fee_per_da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    },
                                    {
                                      "name": "fee_per_l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "total_fees",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "total_mana_used",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "tx_context",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::transaction::tx_context::TxContext",
                      "fields": [
                        {
                          "name": "chain_id",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "version",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "gas_settings",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_settings::GasSettings",
                            "fields": [
                              {
                                "name": "gas_limits",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas::Gas",
                                  "fields": [
                                    {
                                      "name": "da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    },
                                    {
                                      "name": "l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "teardown_gas_limits",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas::Gas",
                                  "fields": [
                                    {
                                      "name": "da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    },
                                    {
                                      "name": "l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "max_fees_per_gas",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas_fees::GasFees",
                                  "fields": [
                                    {
                                      "name": "fee_per_da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    },
                                    {
                                      "name": "fee_per_l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "max_priority_fees_per_gas",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::gas_fees::GasFees",
                                  "fields": [
                                    {
                                      "name": "fee_per_da_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    },
                                    {
                                      "name": "fee_per_l2_gas",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 128
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "vk_tree_root",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "protocol_contracts_hash",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "end",
              "type": {
                "kind": "struct",
                "path": "types::abis::accumulated_data::private_to_rollup_accumulated_data::PrivateToRollupAccumulatedData",
                "fields": [
                  {
                    "name": "note_hashes",
                    "type": {
                      "kind": "array",
                      "length": 64,
                      "type": {
                        "kind": "field"
                      }
                    }
                  },
                  {
                    "name": "nullifiers",
                    "type": {
                      "kind": "array",
                      "length": 64,
                      "type": {
                        "kind": "field"
                      }
                    }
                  },
                  {
                    "name": "l2_to_l1_msgs",
                    "type": {
                      "kind": "array",
                      "length": 8,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::scoped::Scoped",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::messaging::l2_to_l1_message::L2ToL1Message",
                              "fields": [
                                {
                                  "name": "recipient",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::eth_address::EthAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "content",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "contract_address",
                            "type": {
                              "kind": "struct",
                              "path": "types::address::aztec_address::AztecAddress",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "private_logs",
                    "type": {
                      "kind": "array",
                      "length": 64,
                      "type": {
                        "kind": "struct",
                        "path": "types::abis::log::Log",
                        "fields": [
                          {
                            "name": "fields",
                            "type": {
                              "kind": "array",
                              "length": 16,
                              "type": {
                                "kind": "field"
                              }
                            }
                          },
                          {
                            "name": "length",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "contract_class_logs_hashes",
                    "type": {
                      "kind": "array",
                      "length": 1,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::scoped::Scoped",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::log_hash::LogHash",
                              "fields": [
                                {
                                  "name": "value",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "length",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "contract_address",
                            "type": {
                              "kind": "struct",
                              "path": "types::address::aztec_address::AztecAddress",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            },
            {
              "name": "gas_used",
              "type": {
                "kind": "struct",
                "path": "types::abis::gas::Gas",
                "fields": [
                  {
                    "name": "da_gas",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  },
                  {
                    "name": "l2_gas",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "fee_payer",
              "type": {
                "kind": "struct",
                "path": "types::address::aztec_address::AztecAddress",
                "fields": [
                  {
                    "name": "inner",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "expiration_timestamp",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 64
              }
            }
          ]
        },
        "visibility": "databus"
      },
      {
        "name": "previous_kernel_vk_data",
        "type": {
          "kind": "struct",
          "path": "types::proof::vk_data::VkData",
          "fields": [
            {
              "name": "vk",
              "type": {
                "kind": "struct",
                "path": "types::proof::verification_key::VerificationKey",
                "fields": [
                  {
                    "name": "key",
                    "type": {
                      "kind": "array",
                      "length": 151,
                      "type": {
                        "kind": "field"
                      }
                    }
                  },
                  {
                    "name": "hash",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "leaf_index",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "sibling_path",
              "type": {
                "kind": "array",
                "length": 7,
                "type": {
                  "kind": "field"
                }
              }
            }
          ]
        },
        "visibility": "private"
      }
    ],
    "return_type": {
      "abi_type": {
        "kind": "struct",
        "path": "types::abis::kernel_circuit_public_inputs::private_to_rollup_kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs",
        "fields": [
          {
            "name": "constants",
            "type": {
              "kind": "struct",
              "path": "types::abis::tx_constant_data::TxConstantData",
              "fields": [
                {
                  "name": "anchor_block_header",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::block_header::BlockHeader",
                    "fields": [
                      {
                        "name": "last_archive",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                          "fields": [
                            {
                              "name": "root",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "next_available_leaf_index",
                              "type": {
                                "kind": "field"
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "state",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::state_reference::StateReference",
                          "fields": [
                            {
                              "name": "l1_to_l2_message_tree",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                "fields": [
                                  {
                                    "name": "root",
                                    "type": {
                                      "kind": "field"
                                    }
                                  },
                                  {
                                    "name": "next_available_leaf_index",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "partial",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::partial_state_reference::PartialStateReference",
                                "fields": [
                                  {
                                    "name": "note_hash_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  },
                                  {
                                    "name": "nullifier_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  },
                                  {
                                    "name": "public_data_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "sponge_blob_hash",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "tx_effects_tree_root",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "global_variables",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::global_variables::GlobalVariables",
                          "fields": [
                            {
                              "name": "chain_id",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "version",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "block_number",
                              "type": {
                                "kind": "integer",
                                "sign": "unsigned",
                                "width": 32
                              }
                            },
                            {
                              "name": "slot_number",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "timestamp",
                              "type": {
                                "kind": "integer",
                                "sign": "unsigned",
                                "width": 64
                              }
                            },
                            {
                              "name": "coinbase",
                              "type": {
                                "kind": "struct",
                                "path": "types::address::eth_address::EthAddress",
                                "fields": [
                                  {
                                    "name": "inner",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "fee_recipient",
                              "type": {
                                "kind": "struct",
                                "path": "types::address::aztec_address::AztecAddress",
                                "fields": [
                                  {
                                    "name": "inner",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "gas_fees",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "total_fees",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "total_mana_used",
                        "type": {
                          "kind": "field"
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "tx_context",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::transaction::tx_context::TxContext",
                    "fields": [
                      {
                        "name": "chain_id",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "version",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "gas_settings",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::gas_settings::GasSettings",
                          "fields": [
                            {
                              "name": "gas_limits",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas::Gas",
                                "fields": [
                                  {
                                    "name": "da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  },
                                  {
                                    "name": "l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "teardown_gas_limits",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas::Gas",
                                "fields": [
                                  {
                                    "name": "da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  },
                                  {
                                    "name": "l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "max_fees_per_gas",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "max_priority_fees_per_gas",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "vk_tree_root",
                  "type": {
                    "kind": "field"
                  }
                },
                {
                  "name": "protocol_contracts_hash",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            }
          },
          {
            "name": "end",
            "type": {
              "kind": "struct",
              "path": "types::abis::accumulated_data::private_to_rollup_accumulated_data::PrivateToRollupAccumulatedData",
              "fields": [
                {
                  "name": "note_hashes",
                  "type": {
                    "kind": "array",
                    "length": 64,
                    "type": {
                      "kind": "field"
                    }
                  }
                },
                {
                  "name": "nullifiers",
                  "type": {
                    "kind": "array",
                    "length": 64,
                    "type": {
                      "kind": "field"
                    }
                  }
                },
                {
                  "name": "l2_to_l1_msgs",
                  "type": {
                    "kind": "array",
                    "length": 8,
                    "type": {
                      "kind": "struct",
                      "path": "types::side_effect::scoped::Scoped",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "struct",
                            "path": "types::messaging::l2_to_l1_message::L2ToL1Message",
                            "fields": [
                              {
                                "name": "recipient",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::eth_address::EthAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "content",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "contract_address",
                          "type": {
                            "kind": "struct",
                            "path": "types::address::aztec_address::AztecAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  "name": "private_logs",
                  "type": {
                    "kind": "array",
                    "length": 64,
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::log::Log",
                      "fields": [
                        {
                          "name": "fields",
                          "type": {
                            "kind": "array",
                            "length": 16,
                            "type": {
                              "kind": "field"
                            }
                          }
                        },
                        {
                          "name": "length",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 32
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  "name": "contract_class_logs_hashes",
                  "type": {
                    "kind": "array",
                    "length": 1,
                    "type": {
                      "kind": "struct",
                      "path": "types::side_effect::scoped::Scoped",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::log_hash::LogHash",
                            "fields": [
                              {
                                "name": "value",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "length",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "contract_address",
                          "type": {
                            "kind": "struct",
                            "path": "types::address::aztec_address::AztecAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          },
          {
            "name": "gas_used",
            "type": {
              "kind": "struct",
              "path": "types::abis::gas::Gas",
              "fields": [
                {
                  "name": "da_gas",
                  "type": {
                    "kind": "integer",
                    "sign": "unsigned",
                    "width": 32
                  }
                },
                {
                  "name": "l2_gas",
                  "type": {
                    "kind": "integer",
                    "sign": "unsigned",
                    "width": 32
                  }
                }
              ]
            }
          },
          {
            "name": "fee_payer",
            "type": {
              "kind": "struct",
              "path": "types::address::aztec_address::AztecAddress",
              "fields": [
                {
                  "name": "inner",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            }
          },
          {
            "name": "expiration_timestamp",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 64
            }
          }
        ]
      },
      "visibility": "public"
    },
    "error_types": {
      "7132025627426189893": {
        "error_kind": "string",
        "string": "Field failed to decompose into specified 7 limbs"
      },
      "12107089946950716685": {
        "error_kind": "string",
        "string": "previous kernel must be a private_kernel_reset_tail variant"
      },
      "13451820477104772980": {
        "error_kind": "string",
        "string": "Membership check failed: vk hash not found in vk tree"
      }
    }
  },
  "bytecode": "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KP88avxzQ/nnUeOfG8o/jxr/3FD+edT454byz6PGPzeUfx41/rmh/POo8c8N5Z9HjX9uKP88avxzQ/nnUeOfG8o/jxr/3FD+edT454byz6PGPzeUfx6ba+KUfx41/rlpouIa/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PLbSxCn/PGr8czOaimv8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzz2EUTp/zzqPHPzVQqrvHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s+jxj83lH8eNf65ofzzqPHPDeWfR41/bij/PGr8c0P551HjnxvKP48a/9xQ/nnU+OeG8s9jkyZO+edR45+bGVRc458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HND+edR458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HND+edR458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HND+edR458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3lnxPY4h+KU/551PjnZhYV1/jnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HND+edR458byj+PGv/cUP551PjnhvLPo8Y/N5R/HjX+uaH886jxzw3ln0eNf24o/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edxqiZO+edR45/b5lRc459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln8cZmjjln0eNf25bUXGNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/Hmdp4pR/HjX+ue1CxTX+uaX886jxzy3ln0eNf24p/zxq/HNL+edR459byj+PGv/cUv551PjnlvLPo8Y/t5R/HjX+uaX886jxzy3ln0eNf24p/zxq/HNL+edJ459byj9PGv/cUv550vjnlvLPk8Y/t5R/njT+uaX886Txzy3lnyeNf24p/zxp/HNL+edJ459byj9PGv/cUv550vjnlvLPk8Y/t5R/njT+uaX886Txzy3lnyeNf24p/zxp/HNL+edJ459byj9PGv/cUv55aq6JU/550vjntomKa/xzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/PPUShOn/POk8c/taCqu8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz1MXTZzyz5PGP7dTqbjGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/Txr/3FL+edL455byz5PGP7eUf540/rml/POk8c8t5Z8njX9uKf88afxzS/nnSeOfW8o/T02aOOWfJ41/bmdQcY1/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPLeWfJ41/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPLeWfJ41/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPLeWfJ41/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH9OeId/KE7550njn9tZVFzjn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPLeWfJ41/bin/PGn8c0v550njn1vKP08a/9xS/nnS+OeW8s+Txj+3lH+eNP65pfzzpPHPHeWfJ41/7ij/PGn8c0f550njnzvKP08a/9xR/nnS+OeO8s+Txj93lH+eNP65o/zzpPHPHeWfJ41/7ij/PGn8c0f550njnzvKP08a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",
  "debug_symbols": "",
  "file_map": {},
  "verificationKey": {
    "bytes": "0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000051e00000000000000000000000000000000000000000000000000000000000002db000000000000000000000000000000a55c4d92cfb1fb6d5912edf8ea2be5886c00000000000000000000000000000000000d1788be11ea41db745a4b281b91ec000000000000000000000000000000fba2c0b647501940a2ebc669cb455155e00000000000000000000000000000000000087cc488aebe47f7212c199f04a409000000000000000000000000000000a0dd0088a9d960ee648dd68837be114eb0000000000000000000000000000000000005e5d17a2cfb970ef50b489270c2190000000000000000000000000000007bb8874a18d997de0f319fe64c5b320c8b00000000000000000000000000000000002ff527f2632ad73b8155608ee207b300000000000000000000000000000042f02d7d8c714d329f35f7837e3ea47eda00000000000000000000000000000000002de80b1b357312e42ad1e6e7a9b6b4000000000000000000000000000000e9a6ace25c046629118ec008ef45dc73b500000000000000000000000000000000002409cbf12b0dc5bd8ef7cc8277ebff000000000000000000000000000000e2787b64dbf0e0cc13fb94b9af297dd4030000000000000000000000000000000000278da002e7b78e770c52647cec60d20000000000000000000000000000004ed4002e0f5da0f33ebdde3917614fd80900000000000000000000000000000000002c610899559899906cf3dc326f5791000000000000000000000000000000986ca672d13bdde78e4f33b7c0f83f6a6c00000000000000000000000000000000002bf5f1d1b0c6ca1b29afc8890386590000000000000000000000000000007138f17acc898689f121cccc4bd5111bdf00000000000000000000000000000000002e037e09a86cab6ed9e2f51088e066000000000000000000000000000000c7bdba66fed87b4b5ec6699c2fe9e7e493000000000000000000000000000000000027408aaaaa9f20d38d5e33779c5c97000000000000000000000000000000297ca98055c440fb0683de69d239401f3b00000000000000000000000000000000001ba697308d881778c50f57f43c7eaf000000000000000000000000000000a47addb78831d89a1358d9f87b0d70ecfb00000000000000000000000000000000002393c10bff1ed6b37aa40de9dfcda6000000000000000000000000000000a6d0e54b86453e57f537141c101ae642e100000000000000000000000000000000000af332b8f6821c39fd56829fff04a3000000000000000000000000000000cfb2551f150087ad30c5f04fac2a74758a00000000000000000000000000000000001b676d40f2eb99001ee39c70cb8e9f0000000000000000000000000000008dd09800315703835d080d5582bec8a1ad00000000000000000000000000000000000fb73912b7660963e724b4622512c3000000000000000000000000000000e0c9f8d8c781cb0397291b34d541303f8300000000000000000000000000000000001dbbdee470e6d9dff8fa9d9e591cb80000000000000000000000000000006d8411954360a65c2e994c38ec1581ef6100000000000000000000000000000000002950c552924cb4003e31711c5f6d9a000000000000000000000000000000ec9242ddbd270b2ae2ed71d49e384182eb00000000000000000000000000000000001948a0d777fb86f601ff3e42dacee4000000000000000000000000000000bc646f37dcc7cd7740ffacd13e50adbb5700000000000000000000000000000000001aa122c969e8df411621b68363fbd8000000000000000000000000000000a889458d6e81da77f47021f95b3e19d40b00000000000000000000000000000000002337d91c187e186e507c5261f4c9ab0000000000000000000000000000008045348c07d02a5e79ffe8e1ae14b3ded00000000000000000000000000000000000190b997d123585ffb563a08f513f58000000000000000000000000000000883a469f8c07568c3d8116c585d2544686000000000000000000000000000000000017e26e9dfd0dc1c003f6236367e74d000000000000000000000000000000ecb07b8c4c158111a6d710af3134eb7f7200000000000000000000000000000000001e7b19f029999fe1b04c5e2b322e550000000000000000000000000000008007bee7f77c724a97036492010128fd73000000000000000000000000000000000027a71fb232fb4b16b2109a9a8f36a7000000000000000000000000000000c0ea8222ddcda3fa4a1e2d064d4e3e57f70000000000000000000000000000000000181695d8a1ee85851276d16310ac8d0000000000000000000000000000007ba7fc220c00b06fb6320ddacec637008b000000000000000000000000000000000006ab3d47b4632c37fc4a79c4ed74330000000000000000000000000000001a20cf7f4f23cb6a19faa626b2ed37380500000000000000000000000000000000001ecc03684f1944d010a21fdd1ef8b9000000000000000000000000000000698798f42f54755cd8b930f6fce641d7c400000000000000000000000000000000000b9c52340c95c74a7c43e9f3f23a52000000000000000000000000000000ee91ae0dc0c24611450a4361c9db4243a00000000000000000000000000000000000087ec998408225db57e301330d8ce3000000000000000000000000000000d48585a5344d6fe4b28a7bb8377e422d6d00000000000000000000000000000000002a475aaa8e2ef8af7848bf0020651a0000000000000000000000000000005313ba8c1609a6b6ee403d5d996b9f3a3b0000000000000000000000000000000000187b40f5a3d1e9fffef6656f0f62370000000000000000000000000000001eee81b23a887f299049b14c11e98460d600000000000000000000000000000000002a56ce41f6b0be13b9c26747621b82000000000000000000000000000000d5827d6338c78656c0d12ca1aea6ef2c7c00000000000000000000000000000000001aa98f2de3ddda547d8f6de4e725de000000000000000000000000000000b438402d891613c8e7beb536159b95f1db00000000000000000000000000000000001eed36e12da9d9f5e3ee4a700e0531000000000000000000000000000000db2a48e46e55026423000ea236a212959500000000000000000000000000000000002a1cf66bf8b12f8a15314b73d74900000000000000000000000000000000d4218ea34169878cfcbee2a0aba10cf5a6000000000000000000000000000000000011e95f5299216762dce4b425cb9a97000000000000000000000000000000270bdd4693c4329622bace02d8a2ddba8d00000000000000000000000000000000001f502263e55a633e8d6be1ca44eca30000000000000000000000000000000f7ba94963bec143a0f52f572da28074bc0000000000000000000000000000000000190981400d3732f5370af74a117889000000000000000000000000000000f009248f998113a91720600261621462e8000000000000000000000000000000000006afadda4b159da16f5918bdb173920000000000000000000000000000009aa89dd6e629bbcf7b7ce4de6a25aabe0300000000000000000000000000000000002e8bbf53b033a7dee399a97fe2f206000000000000000000000000000000ee0fdab38d20b0ee429e1f32f45f4e827900000000000000000000000000000000002d8e998447b9cca60526f6c0d264cb0000000000000000000000000000006dbee5472d173f4952ee3cdf2931f1113a00000000000000000000000000000000001a11b75f9bb0e1ec84d82852e39a980000000000000000000000000000006fa74a5986c42a2aec0bedf16a29697de30000000000000000000000000000000000034ce8365af06b4f1ec8d7420af6c4000000000000000000000000000000e2c8585fde1810fbaa77bbbe2dd56d41d40000000000000000000000000000000000296114e0a756b5d5cd7e46e2695e51000000000000000000000000000000c4fc22fafd30a41a4a26fb95d60484fbea000000000000000000000000000000000023d2914b6223bf5b44c6782f394a29000000000000000000000000000000f45c0fb62fdaac4c2fff3f4d3c9c5ddc6f00000000000000000000000000000000000b0a90bb0d122b1516f5c580820292000000000000000000000000000000e2552aacaf93f1c2762ec96626c75f0feb00000000000000000000000000000000001a739c02c7dff9f7ee65824bde66640000000000000000000000000000003ad56f0995c9e36e08ff8395d9a816532100000000000000000000000000000000001b79fb42c83cf7489bbc159c889c5e0000000000000000000000000000003cc75faf80e1dadcf6ff95a40bded876990000000000000000000000000000000000120249ba961f9a7488244e4703cc8c0000000000000000000000000000000a829d85129ac92f82461a75f988c503e8000000000000000000000000000000000023681275a9e97155c457dc03c5f199000000000000000000000000000000a3b3957170954f423f38ef79965d03b52700000000000000000000000000000000001a248c28cf2f1a486f651170e0f9ff000000000000000000000000000000d3c526e2e8e46a174f36d47e5a0a57bc0b0000000000000000000000000000000000276cc5538faf69bc1d183b75cf65020000000000000000000000000000006b96e1c1caff1507d3a6e216316a606c2c0000000000000000000000000000000000102d78f7c9ba36402b56e4885aa730000000000000000000000000000000af1e77264a02ff1d3369d28fd0c4bb5ade00000000000000000000000000000000002a9227dfbe88bd6b51f0cb24186b52000000000000000000000000000000951f11c0cad423dd9a72d0fd4c00df36f300000000000000000000000000000000002a7b3601675fec9338e3fc12e380190000000000000000000000000000000a0a85dca0529ccd31bc9c5944d0e0c7b800000000000000000000000000000000002fc6e62770d5595e17ef847582bc3d0000000000000000000000000000007e1d11836d64316b62c2404180f46204df000000000000000000000000000000000012d1ac616c585580d21f847050c5c8",
    "fields": [
      "0x0000000000000000000000000000000000000000000000000000000000000010",
      "0x000000000000000000000000000000000000000000000000000000000000051e",
      "0x00000000000000000000000000000000000000000000000000000000000002db",
      "0x000000000000000000000000000000a55c4d92cfb1fb6d5912edf8ea2be5886c",
      "0x00000000000000000000000000000000000d1788be11ea41db745a4b281b91ec",
      "0x000000000000000000000000000000fba2c0b647501940a2ebc669cb455155e0",
      "0x0000000000000000000000000000000000087cc488aebe47f7212c199f04a409",
      "0x000000000000000000000000000000a0dd0088a9d960ee648dd68837be114eb0",
      "0x000000000000000000000000000000000005e5d17a2cfb970ef50b489270c219",
      "0x0000000000000000000000000000007bb8874a18d997de0f319fe64c5b320c8b",
      "0x00000000000000000000000000000000002ff527f2632ad73b8155608ee207b3",
      "0x00000000000000000000000000000042f02d7d8c714d329f35f7837e3ea47eda",
      "0x00000000000000000000000000000000002de80b1b357312e42ad1e6e7a9b6b4",
      "0x000000000000000000000000000000e9a6ace25c046629118ec008ef45dc73b5",
      "0x00000000000000000000000000000000002409cbf12b0dc5bd8ef7cc8277ebff",
      "0x000000000000000000000000000000e2787b64dbf0e0cc13fb94b9af297dd403",
      "0x0000000000000000000000000000000000278da002e7b78e770c52647cec60d2",
      "0x0000000000000000000000000000004ed4002e0f5da0f33ebdde3917614fd809",
      "0x00000000000000000000000000000000002c610899559899906cf3dc326f5791",
      "0x000000000000000000000000000000986ca672d13bdde78e4f33b7c0f83f6a6c",
      "0x00000000000000000000000000000000002bf5f1d1b0c6ca1b29afc889038659",
      "0x0000000000000000000000000000007138f17acc898689f121cccc4bd5111bdf",
      "0x00000000000000000000000000000000002e037e09a86cab6ed9e2f51088e066",
      "0x000000000000000000000000000000c7bdba66fed87b4b5ec6699c2fe9e7e493",
      "0x000000000000000000000000000000000027408aaaaa9f20d38d5e33779c5c97",
      "0x000000000000000000000000000000297ca98055c440fb0683de69d239401f3b",
      "0x00000000000000000000000000000000001ba697308d881778c50f57f43c7eaf",
      "0x000000000000000000000000000000a47addb78831d89a1358d9f87b0d70ecfb",
      "0x00000000000000000000000000000000002393c10bff1ed6b37aa40de9dfcda6",
      "0x000000000000000000000000000000a6d0e54b86453e57f537141c101ae642e1",
      "0x00000000000000000000000000000000000af332b8f6821c39fd56829fff04a3",
      "0x000000000000000000000000000000cfb2551f150087ad30c5f04fac2a74758a",
      "0x00000000000000000000000000000000001b676d40f2eb99001ee39c70cb8e9f",
      "0x0000000000000000000000000000008dd09800315703835d080d5582bec8a1ad",
      "0x00000000000000000000000000000000000fb73912b7660963e724b4622512c3",
      "0x000000000000000000000000000000e0c9f8d8c781cb0397291b34d541303f83",
      "0x00000000000000000000000000000000001dbbdee470e6d9dff8fa9d9e591cb8",
      "0x0000000000000000000000000000006d8411954360a65c2e994c38ec1581ef61",
      "0x00000000000000000000000000000000002950c552924cb4003e31711c5f6d9a",
      "0x000000000000000000000000000000ec9242ddbd270b2ae2ed71d49e384182eb",
      "0x00000000000000000000000000000000001948a0d777fb86f601ff3e42dacee4",
      "0x000000000000000000000000000000bc646f37dcc7cd7740ffacd13e50adbb57",
      "0x00000000000000000000000000000000001aa122c969e8df411621b68363fbd8",
      "0x000000000000000000000000000000a889458d6e81da77f47021f95b3e19d40b",
      "0x00000000000000000000000000000000002337d91c187e186e507c5261f4c9ab",
      "0x0000000000000000000000000000008045348c07d02a5e79ffe8e1ae14b3ded0",
      "0x0000000000000000000000000000000000190b997d123585ffb563a08f513f58",
      "0x000000000000000000000000000000883a469f8c07568c3d8116c585d2544686",
      "0x000000000000000000000000000000000017e26e9dfd0dc1c003f6236367e74d",
      "0x000000000000000000000000000000ecb07b8c4c158111a6d710af3134eb7f72",
      "0x00000000000000000000000000000000001e7b19f029999fe1b04c5e2b322e55",
      "0x0000000000000000000000000000008007bee7f77c724a97036492010128fd73",
      "0x000000000000000000000000000000000027a71fb232fb4b16b2109a9a8f36a7",
      "0x000000000000000000000000000000c0ea8222ddcda3fa4a1e2d064d4e3e57f7",
      "0x0000000000000000000000000000000000181695d8a1ee85851276d16310ac8d",
      "0x0000000000000000000000000000007ba7fc220c00b06fb6320ddacec637008b",
      "0x000000000000000000000000000000000006ab3d47b4632c37fc4a79c4ed7433",
      "0x0000000000000000000000000000001a20cf7f4f23cb6a19faa626b2ed373805",
      "0x00000000000000000000000000000000001ecc03684f1944d010a21fdd1ef8b9",
      "0x000000000000000000000000000000698798f42f54755cd8b930f6fce641d7c4",
      "0x00000000000000000000000000000000000b9c52340c95c74a7c43e9f3f23a52",
      "0x000000000000000000000000000000ee91ae0dc0c24611450a4361c9db4243a0",
      "0x0000000000000000000000000000000000087ec998408225db57e301330d8ce3",
      "0x000000000000000000000000000000d48585a5344d6fe4b28a7bb8377e422d6d",
      "0x00000000000000000000000000000000002a475aaa8e2ef8af7848bf0020651a",
      "0x0000000000000000000000000000005313ba8c1609a6b6ee403d5d996b9f3a3b",
      "0x0000000000000000000000000000000000187b40f5a3d1e9fffef6656f0f6237",
      "0x0000000000000000000000000000001eee81b23a887f299049b14c11e98460d6",
      "0x00000000000000000000000000000000002a56ce41f6b0be13b9c26747621b82",
      "0x000000000000000000000000000000d5827d6338c78656c0d12ca1aea6ef2c7c",
      "0x00000000000000000000000000000000001aa98f2de3ddda547d8f6de4e725de",
      "0x000000000000000000000000000000b438402d891613c8e7beb536159b95f1db",
      "0x00000000000000000000000000000000001eed36e12da9d9f5e3ee4a700e0531",
      "0x000000000000000000000000000000db2a48e46e55026423000ea236a2129595",
      "0x00000000000000000000000000000000002a1cf66bf8b12f8a15314b73d74900",
      "0x000000000000000000000000000000d4218ea34169878cfcbee2a0aba10cf5a6",
      "0x000000000000000000000000000000000011e95f5299216762dce4b425cb9a97",
      "0x000000000000000000000000000000270bdd4693c4329622bace02d8a2ddba8d",
      "0x00000000000000000000000000000000001f502263e55a633e8d6be1ca44eca3",
      "0x0000000000000000000000000000000f7ba94963bec143a0f52f572da28074bc",
      "0x0000000000000000000000000000000000190981400d3732f5370af74a117889",
      "0x000000000000000000000000000000f009248f998113a91720600261621462e8",
      "0x000000000000000000000000000000000006afadda4b159da16f5918bdb17392",
      "0x0000000000000000000000000000009aa89dd6e629bbcf7b7ce4de6a25aabe03",
      "0x00000000000000000000000000000000002e8bbf53b033a7dee399a97fe2f206",
      "0x000000000000000000000000000000ee0fdab38d20b0ee429e1f32f45f4e8279",
      "0x00000000000000000000000000000000002d8e998447b9cca60526f6c0d264cb",
      "0x0000000000000000000000000000006dbee5472d173f4952ee3cdf2931f1113a",
      "0x00000000000000000000000000000000001a11b75f9bb0e1ec84d82852e39a98",
      "0x0000000000000000000000000000006fa74a5986c42a2aec0bedf16a29697de3",
      "0x0000000000000000000000000000000000034ce8365af06b4f1ec8d7420af6c4",
      "0x000000000000000000000000000000e2c8585fde1810fbaa77bbbe2dd56d41d4",
      "0x0000000000000000000000000000000000296114e0a756b5d5cd7e46e2695e51",
      "0x000000000000000000000000000000c4fc22fafd30a41a4a26fb95d60484fbea",
      "0x000000000000000000000000000000000023d2914b6223bf5b44c6782f394a29",
      "0x000000000000000000000000000000f45c0fb62fdaac4c2fff3f4d3c9c5ddc6f",
      "0x00000000000000000000000000000000000b0a90bb0d122b1516f5c580820292",
      "0x000000000000000000000000000000e2552aacaf93f1c2762ec96626c75f0feb",
      "0x00000000000000000000000000000000001a739c02c7dff9f7ee65824bde6664",
      "0x0000000000000000000000000000003ad56f0995c9e36e08ff8395d9a8165321",
      "0x00000000000000000000000000000000001b79fb42c83cf7489bbc159c889c5e",
      "0x0000000000000000000000000000003cc75faf80e1dadcf6ff95a40bded87699",
      "0x0000000000000000000000000000000000120249ba961f9a7488244e4703cc8c",
      "0x0000000000000000000000000000000a829d85129ac92f82461a75f988c503e8",
      "0x000000000000000000000000000000000023681275a9e97155c457dc03c5f199",
      "0x000000000000000000000000000000a3b3957170954f423f38ef79965d03b527",
      "0x00000000000000000000000000000000001a248c28cf2f1a486f651170e0f9ff",
      "0x000000000000000000000000000000d3c526e2e8e46a174f36d47e5a0a57bc0b",
      "0x0000000000000000000000000000000000276cc5538faf69bc1d183b75cf6502",
      "0x0000000000000000000000000000006b96e1c1caff1507d3a6e216316a606c2c",
      "0x0000000000000000000000000000000000102d78f7c9ba36402b56e4885aa730",
      "0x000000000000000000000000000000af1e77264a02ff1d3369d28fd0c4bb5ade",
      "0x00000000000000000000000000000000002a9227dfbe88bd6b51f0cb24186b52",
      "0x000000000000000000000000000000951f11c0cad423dd9a72d0fd4c00df36f3",
      "0x00000000000000000000000000000000002a7b3601675fec9338e3fc12e38019",
      "0x0000000000000000000000000000000a0a85dca0529ccd31bc9c5944d0e0c7b8",
      "0x00000000000000000000000000000000002fc6e62770d5595e17ef847582bc3d",
      "0x0000000000000000000000000000007e1d11836d64316b62c2404180f46204df",
      "0x000000000000000000000000000000000012d1ac616c585580d21f847050c5c8"
    ],
    "hash": "0x15d84b93ab1f848427957fa2926e131dc36c27c470da14af6e1cad014900625f"
  },
  "aztec_version": "6.0.0"
}
;
